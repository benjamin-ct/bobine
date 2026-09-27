import { useLayoutEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
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
import PublicProfile from "./modules/public-profile/index.ts";
import Search from "./modules/search/index.ts";
import SharedList from "./modules/shared-list/index.ts";
import { LoginPage, VerifyAuthPage, MembersOnlyDialog } from "./modules/auth/index.ts";
import { TermsPage, PrivacyPolicyPage } from "./modules/legal/index.ts";
import NotFound from "./modules/not-found/index.ts";
import { fadeIn, isPosterTransitionRunning } from "./shared/lib/motion.ts";

export default function App() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const [hasNavigated, setHasNavigated] = useState(false);

  // Fondu court à chaque changement de page (pas au premier affichage,
  // couvert par le splash, ni quand seuls les paramètres changent : onglets
  // du profil, filtres). En layout effect pour partir de l'opacité 0 avant
  // que la nouvelle page ne soit peinte.
  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setHasNavigated(true);
    // Transition d'affiche en cours : elle fait déjà son propre fondu.
    if (!isPosterTransitionRunning()) {
      fadeIn(mainRef.current);
    }
  }, [pathname]);

  // Page retrouvée par un retour (bouton « Retour », geste ou navigateur) :
  // les affiches ne rejouent pas leur arrivée en cascade (stagger.module.css).
  // Elles doivent être déjà en place, notamment pour que l'affiche de la fiche
  // regagne sa carte (motion.ts, morphPoster). Le premier affichage est aussi
  // un « POP » pour React Router : il garde sa cascade.
  const restored = navigationType === "POP" && hasNavigated;

  return (
    <>
      <ScrollToTop />
      <RecaptchaBadge />
      <NavBar />
      <main ref={mainRef} data-restored={restored || undefined}>
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/nouveautes" element={<NewReleases />} />
          <Route path="/prochainement" element={<ComingSoon />} />
          <Route path="/media/:mediaType/:id" element={<Detail />} />
          <Route path="/personne/:id" element={<Person />} />
          <Route path="/aleatoire" element={<Random />} />
          <Route path="/ma-liste" element={<Navigate to="/profil?tab=ma-liste" replace />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/u/:slug" element={<PublicProfile />} />
          <Route path="/recherche" element={<Search />} />
          <Route path="/liste/:slug" element={<SharedList />} />
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
