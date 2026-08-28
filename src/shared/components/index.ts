// Barrel — point d'entrée unique des composants réutilisables transverses
// (voir README, "Structure du projet"). Importés par tous les modules
// métier ; n'importe jamais, à l'inverse, les internals d'un module.
export { default as MediaCard } from "./MediaCard/MediaCard.tsx";
export { default as PersonCard } from "./PersonCard/PersonCard.tsx";
export { Loading, ErrorMessage, EmptyState } from "./StateMessage/StateMessage.tsx";
export { default as DonutChart } from "./DonutChart/DonutChart.tsx";
export type { DonutSegment } from "./DonutChart/DonutChart.tsx";
export { default as RatingStars } from "./RatingStars/RatingStars.tsx";
export { default as ProviderBadges } from "./ProviderBadges/ProviderBadges.tsx";
export { default as TrailerButton } from "./TrailerButton/TrailerButton.tsx";
export { default as ScrollToTop } from "./ScrollToTop/ScrollToTop.tsx";
export { default as ScrollToTopButton } from "./ScrollToTopButton/ScrollToTopButton.tsx";
export { default as Chip } from "./Chip/Chip.tsx";
export { default as Dropdown } from "./Dropdown/Dropdown.tsx";
export { default as NavBar } from "./NavBar/NavBar.tsx";
export { default as Footer } from "./Footer/Footer.tsx";
export { default as FilterBar } from "./FilterBar/FilterBar.tsx";
export {
  default as AdvancedFilters,
  EMPTY_ADVANCED_FILTERS,
} from "./AdvancedFilters/AdvancedFilters.tsx";
export type { AdvancedFiltersState } from "./AdvancedFilters/AdvancedFilters.tsx";
export { default as CountryLanguageFilter } from "./CountryLanguageFilter/CountryLanguageFilter.tsx";
export { default as PageHeader } from "./PageHeader/PageHeader.tsx";
export { default as ContinueWatchingRow } from "./ContinueWatchingRow/ContinueWatchingRow.tsx";
export { default as Disclosure } from "./Disclosure/Disclosure.tsx";
