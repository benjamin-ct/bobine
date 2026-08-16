import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LibraryProvider } from './context/LibraryContext.jsx'
import { RegionProvider } from './context/RegionContext.jsx'
import { FavoriteProvidersProvider } from './context/FavoriteProvidersContext.jsx'
import { ExcludedGenresProvider } from './context/ExcludedGenresContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <RegionProvider>
        <FavoriteProvidersProvider>
          <ExcludedGenresProvider>
            <AuthProvider>
              <LibraryProvider>
                <App />
              </LibraryProvider>
            </AuthProvider>
          </ExcludedGenresProvider>
        </FavoriteProvidersProvider>
      </RegionProvider>
    </BrowserRouter>
  </StrictMode>,
)
