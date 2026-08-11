import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import ScrollToTop from "./components/ScrollToTop";
import ScrollToTopButton from "./components/ScrollToTopButton";
import Discover from "./pages/Discover";
import Detail from "./pages/Detail";
import Random from "./pages/Random";
import MyList from "./pages/MyList";
import Search from "./pages/Search";
import Person from "./pages/Person";
import Login from "./pages/Login";
import VerifyAuth from "./pages/VerifyAuth";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/media/:mediaType/:id" element={<Detail />} />
          <Route path="/personne/:id" element={<Person />} />
          <Route path="/aleatoire" element={<Random />} />
          <Route path="/ma-liste" element={<MyList />} />
          <Route path="/recherche" element={<Search />} />
          <Route path="/connexion" element={<Login />} />
          <Route path="/auth/verify" element={<VerifyAuth />} />
        </Routes>
      </main>
      <ScrollToTopButton />
    </>
  );
}
