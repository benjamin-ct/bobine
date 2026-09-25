import { Routes, Route, Navigate } from "react-router-dom";
import {
  NavBar,
  ScrollToTop,
  ScrollToTopButton,
  RecaptchaBadge,
  Footer,
  LegalLinks,
  InAppNotifications,
  PullToRefresh,
} from "./shared/components/index.ts";
import Discover from "./modules/discover/index.ts";
import NewReleases from "./modules/new-releases/index.ts";
import ComingSoon from "./modules/coming-soon/index.ts";
import Detail from "./modules/detail/index.ts";
import Person from "./modules/person/index.ts";
import Random from "./modules/random/index.ts";
import Profile from "./modules/profile/index.ts";
import Search from "./modules/search/index.ts";
import { LoginPage, VerifyAuthPage, MembersOnlyDialog } from "./modules/auth/index.ts";
import { TermsPage, PrivacyPolicyPage } from "./modules/legal/index.ts";
import NotFound from "./modules/not-found/index.ts";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <RecaptchaBadge />
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/nouveautes" element={<NewReleases />} />
          <Route path="/prochainement" element={<ComingSoon />} />
          <Route path="/media/:mediaType/:id" element={<Detail />} />
          <Route path="/personne/:id" element={<Person />} />
          <Route path="/aleatoire" element={<Random />} />
          <Route path="/ma-liste" element={<Navigate to="/profil?tab=ma-liste" replace />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/recherche" element={<Search />} />
          <Route path="/connexion" element={<LoginPage />} />
          <Route path="/auth/verify" element={<VerifyAuthPage />} />
          <Route path="/conditions-utilisation" element={<TermsPage />} />
          <Route path="/confidentialite" element={<PrivacyPolicyPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <LegalLinks />
      <ScrollToTopButton />
      <InAppNotifications />
      <PullToRefresh />
      <MembersOnlyDialog />
    </>
  );
}
