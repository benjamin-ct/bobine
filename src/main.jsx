import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LibraryProvider } from './context/LibraryContext.jsx'
import { RegionProvider } from './context/RegionContext.jsx'
import { FavoriteProvidersProvider } from './context/FavoriteProvidersContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <RegionProvider>
        <FavoriteProvidersProvider>
          <AuthProvider>
            <LibraryProvider>
              <App />
            </LibraryProvider>
          </AuthProvider>
        </FavoriteProvidersProvider>
      </RegionProvider>
    </BrowserRouter>
  </StrictMode>,
)
