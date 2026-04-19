import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ChimpActivity } from "./pages/ChimpActivity";
import { ChimpsList } from "./pages/ChimpsList";
import { DashboardHome } from "./pages/DashboardHome";
import "./index.css";

function Header() {
  return (
    <nav className="border-b p-4">
      <div className="container mx-auto flex items-center gap-8">
        <Link to="/" className="font-bold text-xl">
          Circus
        </Link>
        <div className="flex gap-4">
          <Link to="/chimps" className="hover:underline">
            Chimps
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/chimps" element={<ChimpsList />} />
        <Route
          path="/chimps/:profile/:chimpId/activity"
          element={<ChimpActivity />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
