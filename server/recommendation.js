// recommendation.js

const express = require('express');
const router = express.Router();

const User = require('./model/users');      // Adjust path if your users model is elsewhere
const Laptop = require('./model/Laptop');   // Adjust path if your Laptop model is elsewhere

// ==============================
//   ONE-HOT CATEGORIES & HELPERS
// ==============================

// You may wish to extend this list based on your actual brand/processor mix.
const BRANDS = ['hp', 'dell', 'lenovo', 'asus', 'acer', 'msi', 'apple', 'other'];
const PROC_TYPES = ['intel', 'amd', 'applesilicon', 'other'];
const PROC_GENS = ['8', '9', '10', '11', '12', '13', '14', 'other'];
const RAM_TYPES = ['ddr3', 'ddr4', 'ddr5', 'lpddr4', 'lpddr4x', 'lpddr5', 'other'];
const STOR_TYPES = ['hdd', 'ssd', 'nvme', 'emmc', 'other'];

// ==============================
//   WEIGHT CONSTANTS
// ==============================

const PRICE_WEIGHT = 0.75;    // doubles the impact of price differences
const BRAND_WEIGHT = 1.2;    // increases brand match impact by 50%

// ==============================
//   UTILITY FUNCTIONS
// ==============================

function oneHot(list, val) {
  if (!val || typeof val !== 'string') {
    return list.includes('other')
      ? list.map(x => (x === 'other' ? 1 : 0))
      : list.map(() => 0);
  }
  const low = val.toLowerCase();
  if (list.includes(low)) {
    return list.map(x => (x === low ? 1 : 0));
  } else if (list.includes('other')) {
    return list.map(x => (x === 'other' ? 1 : 0));
  } else {
    return list.map(() => 0);
  }
}

function logPrice(p) {
  return Math.log((p || 0) + 1);
}

function buildFeatureVector(laptop) {
  // Numeric features
  const ramSize = laptop.specs?.ram?.size ? Number(laptop.specs.ram.size) : 0;
  const storageSize = laptop.specs?.storage?.size ? Number(laptop.specs.storage.size) : 0;
  const displayInch = laptop.specs?.displayInch ? Number(laptop.specs.displayInch) : 0;

  // Representative price (lowest among all sites)
  let representativePrice = 0;
  if (Array.isArray(laptop.sites) && laptop.sites.length > 0) {
    const prices = laptop.sites
      .map(s => (typeof s.price === 'number' && s.price >= 0 ? s.price : Infinity))
      .filter(v => v < Infinity);
    if (prices.length > 0) {
      representativePrice = Math.min(...prices);
    }
  }
  const priceLog = logPrice(representativePrice) * PRICE_WEIGHT;

  // GPU flag
  const hasGPU = laptop.specs?.gpu && String(laptop.specs.gpu).toLowerCase() !== 'integrated' ? 1 : 0;

  // One-hot encodings with brand weight
  const brandVal = laptop.brand ? String(laptop.brand).toLowerCase() : '';
  const brandVec = oneHot(BRANDS, brandVal).map(v => v * BRAND_WEIGHT);

  // Processor type
  let rawProcType = '';
  if (laptop.specs?.processor?.name) {
    rawProcType = String(laptop.specs.processor.name).split(' ')[0].toLowerCase();
  }
  const procTypeVec = oneHot(PROC_TYPES, rawProcType);

  // Processor generation
  const rawGen = laptop.specs?.processor?.gen ? String(laptop.specs.processor.gen) : '';
  const procGenVec = oneHot(PROC_GENS, rawGen);

  // RAM type
  const rawRamType = laptop.specs?.ram?.type ? String(laptop.specs.ram.type).toLowerCase() : '';
  const ramTypeVec = oneHot(RAM_TYPES, rawRamType);

  // Storage type
  const rawStorType = laptop.specs?.storage?.type ? String(laptop.specs.storage.type).toLowerCase() : '';
  const storTypeVec = oneHot(STOR_TYPES, rawStorType);

  // Assemble feature vector
  return [
    ramSize,
    storageSize,
    displayInch,
    priceLog,
    hasGPU,
    ...brandVec,
    ...procTypeVec,
    ...procGenVec,
    ...ramTypeVec,
    ...storTypeVec,
  ];
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return (magA && magB) ? dot / (magA * magB) : 0;
}

// ==============================
//   RECOMMENDATION ROUTE
// ==============================

/**
 * GET /api/recommendations/:userId
 */
router.get('/:userId', async (req, res) => {
  try {
    // 1) Load user + history
    const user = await User.findById(req.params.userId).populate('history').exec();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // 2) Build or use cached profileVector
    let profileVector;
    if (Array.isArray(user.profileVector) && user.profileVector.length) {
      profileVector = user.profileVector;
    } else {
      // Check if user has any history
      if (!user.history || !Array.isArray(user.history) || user.history.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'User has no history to generate recommendations from.'
        });
      }

      const historyVectors = user.history.map(buildFeatureVector).filter(vec => vec && vec.length > 0);

      // Check if we have valid vectors
      if (historyVectors.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Unable to generate profile from user history.'
        });
      }

      const vectorLength = historyVectors[0].length;
      profileVector = new Array(vectorLength).fill(0);
      historyVectors.forEach(vec => {
        for (let i = 0; i < vectorLength; i++) {
          profileVector[i] += vec[i];
        }
      });
      for (let i = 0; i < vectorLength; i++) {
        profileVector[i] /= historyVectors.length;
      }
      user.profileVector = profileVector;
      await user.save();
    }

    // 3) Fetch all laptops (excluding history) with .lean()
    const historyIds = new Set((user.history || []).map(l => l._id.toString()));
    const allLaptops = await Laptop.find({}, {
      specs: 1,
      brand: 1,
      series: 1,
      sites: 1,
      featureVector: 1,
      allTimeLowPrice: 1
    })
      .lean()
      .exec();

    // 4) Score & filter
    const scored = allLaptops
      .filter(lap => !historyIds.has(lap._id.toString()))
      .map(lap => {
        const vec = lap.featureVector || buildFeatureVector(lap);
        const score = cosineSimilarity(profileVector, vec);
        return { lap, score };
      });

    // 5) Sort & return top 5
    scored.sort((a, b) => b.score - a.score);
    const recommendations = scored.slice(0, 5).map(({ lap, score }) => {
      // Extract Amazon and Flipkart data separately
      let amazonPrice = null;
      let amazonRating = null;
      let amazonUrl = null;
      let flipkartPrice = null;
      let flipkartRating = null;
      let flipkartUrl = null;

      if (lap.sites && lap.sites.length > 0) {
        // Find Amazon site data
        const amazonSite = lap.sites.find(
          (site) => site.source && site.source.toLowerCase() === "amazon"
        );
        if (amazonSite) {
          amazonPrice = amazonSite.price;
          amazonRating = amazonSite.rating;
          amazonUrl = amazonSite.link;
        }

        // Find Flipkart site data
        const flipkartSite = lap.sites.find(
          (site) => site.source && site.source.toLowerCase() === "flipkart"
        );
        if (flipkartSite) {
          flipkartPrice = flipkartSite.price;
          flipkartRating = flipkartSite.rating;
          flipkartUrl = flipkartSite.link;
        }
      }

      // Get images (limit to 2)
      const images = lap.specs?.details?.imageLinks || [];
      const imageLinks = images.slice(0, 2);

      return {
        id: lap._id,
        title: lap.specs?.head || "Unknown Model",
        brand: lap.brand || "Unknown Brand",
        series: lap.series || "Unknown Series",
        processor: lap.specs?.processor
          ? `${lap.specs.processor.name || ""} ${lap.specs.processor.gen || ""
          }${lap.specs.processor.gen ? "th Gen" : ""}`
          : "Unknown Processor",
        ram: lap.specs?.ram
          ? `${lap.specs.ram.size || ""}${lap.specs.ram.size ? "GB" : ""
          } ${lap.specs.ram.type?.toUpperCase() || ""}`
          : "Unknown RAM",
        storage: lap.specs?.storage
          ? require('./utils/storageUtils').formatStorage(lap.specs.storage)
          : "Unknown Storage",
        amazonPrice: amazonPrice,
        amazonRating: amazonRating,
        amazonUrl: amazonUrl,
        flipkartPrice: flipkartPrice,
        flipkartRating: flipkartRating,
        flipkartUrl: flipkartUrl,
        basePrice: lap.allTimeLowPrice,
        images: imageLinks.length > 0 ? imageLinks : null,
        score: Number(score.toFixed(4))
      };
    });

    res.json({ success: true, recommendations });
  } catch (err) {
    console.error('Recommendation error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
