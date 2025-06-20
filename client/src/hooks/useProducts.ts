import { useState, useEffect, useCallback } from "react";
import type { Product } from "../types/Product";
import { removeDuplicates, removeAdvancedDuplicates } from "../utils";

interface UseProductsReturn {
  carouselProducts: Product[];
  recommendedProducts: Product[];
  popularProducts: Product[];
  dealProducts: Product[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseProductsProps {
  userId?: string | null;
}

export const useProducts = ({ userId }: UseProductsProps = {}): UseProductsReturn => {
  const [carouselProducts, setCarouselProducts] = useState<Product[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [dealProducts, setDealProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);      // Transform function for API data to Product type
      const transformApiData = (laptop: {
        id: string;
        title: string;
        brand: string;
        series: string;
        amazonPrice?: number;
        amazonRating?: number;
        amazonUrl?: string;
        flipkartPrice?: number;
        flipkartRating?: number;
        flipkartUrl?: string;
        basePrice?: number;
        images?: string[];
        processor: string;
        ram: string;
        storage: string;
        // Add fields for deals API structure
        rating?: string | number;
        ratingsNumber?: string | number;
      }) => {
        // Determine display price (show lowest available or first available)
        const displayPrice = laptop.amazonPrice && laptop.flipkartPrice
          ? Math.min(laptop.amazonPrice, laptop.flipkartPrice)
          : laptop.amazonPrice || laptop.flipkartPrice || laptop.basePrice;        return {
          productId: laptop.id,
          productName: laptop.title,
          productLink: laptop.amazonUrl || laptop.flipkartUrl || "#",
          price: displayPrice
            ? `₹${displayPrice.toLocaleString()}`
            : "Price not available",
          basePrice: laptop.basePrice
            ? `₹${laptop.basePrice.toLocaleString()}`
            : undefined,
          // Handle both deals API structure (top-level rating) and other APIs (amazonRating/flipkartRating)
          rating: laptop.rating?.toString() || laptop.amazonRating?.toString() || laptop.flipkartRating?.toString() || null,
          ratingsNumber: laptop.ratingsNumber?.toString() || null,
          technicalDetails: {
            imageLinks: laptop.images || [],
            "Model Name": laptop.title,
            Brand: laptop.brand || "Not specified",
            Series: laptop.series || "Not specified",
            "Processor Name": laptop.processor || "Not specified",
            RAM: laptop.ram || "Not specified",
            "Storage Type": laptop.storage || "Not specified",
          },          sites: [
            ...(laptop.amazonPrice
              ? [
                  {
                    source: "amazon" as const,
                    price: `₹${laptop.amazonPrice.toLocaleString()}`,
                    link: laptop.amazonUrl || "#",
                    rating: laptop.amazonRating
                      ? laptop.amazonRating.toString()
                      : undefined,
                    ratingCount: undefined, // Remove fake rating counts
                  },
                ]
              : []),
            ...(laptop.flipkartPrice
              ? [
                  {
                    source: "flipkart" as const,
                    price: `₹${laptop.flipkartPrice.toLocaleString()}`,
                    link: laptop.flipkartUrl || "#",
                    rating: laptop.flipkartRating
                      ? laptop.flipkartRating.toString()
                      : undefined,
                    ratingCount: undefined, // Remove fake rating counts
                  },
                ]
              : []),
          ],
        };
      };      // Fetch carousel products from /api/random
      const carouselResponse = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/random?count=8`
      );
      if (!carouselResponse.ok) {
        throw new Error(`HTTP error! status: ${carouselResponse.status}`);
      }
      const carouselData = await carouselResponse.json();      // Fetch recommended products - use personalized recommendations for authenticated users ONLY
      let recommendedData: Product[] = [];
      if (userId) {
        // Fetch personalized recommendations for authenticated users
        try {
          console.log("Fetching personalized recommendations for user:", userId);
          const recommendationResponse = await fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/recommendations/${userId}`,
            {
              credentials: 'include', // Include cookies for authentication
            }
          );
          
          if (recommendationResponse.ok) {
            const recommendationResult = await recommendationResponse.json();
            console.log("Recommendation API response:", recommendationResult);
            if (recommendationResult.success && Array.isArray(recommendationResult.recommendations)) {
              // Transform recommendations data using the same function as other APIs
              console.log("Raw recommendations before transform:", recommendationResult.recommendations);
              recommendedData = removeDuplicates(
                recommendationResult.recommendations.map(transformApiData)
              ).slice(0, 16);
              console.log("Transformed recommendations:", recommendedData);
            }
          } else if (recommendationResponse.status === 400) {
            // Handle 400 error (user has no history) gracefully - this is expected for new users
            console.log("User has no history for personalized recommendations - will not show recommendation section");
            // Keep recommendedData empty for new users so recommendation section won't show
          } else {
            console.warn("Recommendation API response not ok:", recommendationResponse.status);
          }
        } catch (recommendationError) {
          console.warn("Failed to fetch personalized recommendations:", recommendationError);
        }
      }
      
      // DO NOT fallback to general suggestions for authenticated users
      // If user has no history, keep recommendedData empty so the recommendation section won't show
      // Only non-authenticated users will see popular laptops instead

      // Fetch popular products from /api/popular
      const popularResponse = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/popular?count=16`
      );
      if (!popularResponse.ok) {
        throw new Error(`HTTP error! status: ${popularResponse.status}`);
      }
      const popularData = await popularResponse.json();

      // Fetch deal products from /api/deals (actual discounted products)
      const dealResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/deals`);
      if (!dealResponse.ok) {
        throw new Error(`HTTP error! status: ${dealResponse.status}`);
      }
      const dealData = await dealResponse.json();

      // Validate carousel data
      if (!carouselData.success || !Array.isArray(carouselData.laptops)) {
        throw new Error("Invalid carousel data format received from server");
      }

      // Validate popular data
      if (!popularData.success || !Array.isArray(popularData.laptops)) {
        throw new Error("Invalid popular data format received from server");
      }

      // Validate deal data
      if (!dealData.success || !Array.isArray(dealData.laptops)) {
        throw new Error("Invalid deal data format received from server");
      }      // Transform all data sets
      const transformedCarouselData = removeDuplicates(
        carouselData.laptops.map(transformApiData)
      );
      const transformedDealData = removeAdvancedDuplicates(
        dealData.laptops.map(transformApiData)
      );
      const transformedPopularData = removeDuplicates(
        popularData.laptops.map(transformApiData)
      );

      setCarouselProducts(transformedCarouselData);
      setRecommendedProducts(recommendedData);
      setPopularProducts(transformedPopularData);
      setDealProducts(transformedDealData);
    } catch (err: unknown) {
      console.error("Error fetching products:", err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return {
    carouselProducts,
    recommendedProducts,
    popularProducts,
    dealProducts,
    loading,
    error,
    refetch: fetchProducts,
  };
};
