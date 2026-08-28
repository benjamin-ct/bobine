import { Routes, Route } from "react-router-dom";
import { NavBar, ScrollToTop, ScrollToTopButton, Footer } from "./shared/components/index.ts";
import Discover from "./modules/discover/index.ts";
import NewReleases from "./modules/new-releases/index.ts";
import ComingSoon from "./modules/coming-soon/index.ts";
import Detail from "./modules/detail/index.ts";
import Person from "./modules/person/index.ts";
import Random from "./modules/random/index.ts";
import MyList from "./modules/my-list/index.ts";
import Profile from "./modules/profile/index.ts";
import Search from "./modules/search/index.ts";
import { LoginPage, VerifyAuthPage } from "./modules/auth/index.ts";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/nouveautes" element={<NewReleases />} />
          <Route path="/prochainement" element={<ComingSoon />} />
          <Route path="/media/:mediaType/:id" element={<Detail />} />
          <Route path="/personne/:id" element={<Person />} />
          <Route path="/aleatoire" element={<Random />} />
          <Route path="/ma-liste" element={<MyList />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/recherche" element={<Search />} />
          <Route path="/connexion" element={<LoginPage />} />
          <Route path="/auth/verify" element={<VerifyAuthPage />} />
        </Routes>
      </main>
      <Footer />
      <ScrollToTopButton />
    </>
  );
}
