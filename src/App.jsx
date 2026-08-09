import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Discover from "./pages/Discover";
import Detail from "./pages/Detail";
import Random from "./pages/Random";
import MyList from "./pages/MyList";
import Search from "./pages/Search";
import Person from "./pages/Person";

export default function App() {
  return (
    <>
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/media/:mediaType/:id" element={<Detail />} />
          <Route path="/personne/:id" element={<Person />} />
          <Route path="/aleatoire" element={<Random />} />
          <Route path="/ma-liste" element={<MyList />} />
          <Route path="/recherche" element={<Search />} />
        </Routes>
      </main>
    </>
  );
}
