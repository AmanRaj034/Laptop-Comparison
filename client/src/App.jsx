import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import axios from 'axios'
import HomePage from './views/HomePage'
import Compare from './views/Compare'
import { GetData } from "./context/DataContext";
import ComparisonPage from './views/ComparisonPage'
import Footer from './component/Footer'
import NavBar from "@/component/NavBar";
import CompareComponent from "@/component/CompareComponent";





function App() {



  return (
    <>
    
      <GetData>
      
        <Router future={{
          v7_startTransition: true,
          v7_normalizeFormMethod: true,
          v7_partialHydration: true,
          v7_relativeSplatPath: true,
          v7_skipActionErrorRevalidation: true
        }}>
          <CompareComponent />
         
          <Routes>
            
            <Route path="/homePage" element={<HomePage />} />
            <Route path="/compare/:id1/:id2" element={<ComparisonPage />} />
            <Route path="/homePage/:id" element={<Compare />} />
          </Routes>
        </Router>
        <Footer />
      </GetData>




    </>
  )
}

export default App
