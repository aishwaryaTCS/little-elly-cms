import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, Shell, useAuth } from "./components.jsx";
import { DialogProvider } from "./content/ui.jsx";
import ListPage from "./content/ListPage.jsx";
import ItemPage from "./content/ItemPage.jsx";
import Posts from "./blog/Posts.jsx";
import PostEditor from "./blog/PostEditor.jsx";
import PostPreview from "./blog/PostPreview.jsx";
import Categories from "./blog/Categories.jsx";
import BlogPage from "./blog/BlogPage.jsx";
import { SeoPageForm, SeoPages } from "./seo/SeoPages.jsx";
import SiteSettings from "./seo/SiteSettings.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Centres from "./pages/Centres.jsx";
import CentreForm from "./pages/CentreForm.jsx";
import Finder from "./pages/Finder.jsx";
import Defaults from "./pages/Defaults.jsx";
import Account from "./pages/Account.jsx";

function Gate({ children }) {
  const { admin } = useAuth();
  if (admin === undefined) return <div className="splash">Little Elly</div>;
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}

function Guest({ children }) {
  const { admin } = useAuth();
  if (admin === undefined) return <div className="splash">Little Elly</div>;
  if (admin) return <Navigate to="/" replace />;
  return children;
}

// "{Page} · Little Elly CMS" in the browser tab.
const TITLES = [
  [/^\/login/, "Sign in"],
  [/^\/website\/team/, "Our team"],
  [/^\/website\/awards/, "Awards"],
  [/^\/website\/programs/, "Programs"],
  [/^\/website\/parent-voices/, "Parent voices"],
  [/^\/website\/news/, "News & events"],
  [/^\/blogs\/posts\/[^/]+\/preview/, "Preview"],
  [/^\/blogs\/posts/, "Blog posts"],
  [/^\/blogs\/categories/, "Categories"],
  [/^\/blogs\/page/, "Blog page"],
  [/^\/seo\/pages/, "SEO pages"],
  [/^\/seo\/site/, "Site settings"],
  [/^\/centres/, "Centres"],
  [/^\/finder/, "Finder page"],
  [/^\/defaults/, "Shared defaults"],
  [/^\/account/, "Account"],
];

function TabTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = TITLES.find(([pattern]) => pattern.test(pathname));
    document.title = `${match ? match[1] : "Dashboard"} · Little Elly CMS`;
  }, [pathname]);
  return null;
}

const content = [
  ["team", "website/team"],
  ["awards", "website/awards"],
  ["programs", "website/programs"],
  ["testimonials", "website/parent-voices"],
  ["news", "website/news"],
];

export default function App() {
  return (
    <AuthProvider>
      <DialogProvider>
        <TabTitle />
        <Routes>
          <Route path="/login" element={<Guest><Login /></Guest>} />
          <Route path="/blogs/posts/:id/preview" element={<Gate><PostPreview /></Gate>} />
          <Route element={<Gate><Shell /></Gate>}>
            <Route index element={<Dashboard />} />
            {content.map(([key, path]) => [
              <Route key={key} path={path} element={<ListPage typeKey={key} />} />,
              <Route key={`${key}-item`} path={`${path}/:id`} element={<ItemPage key={key} typeKey={key} />} />,
            ])}
            <Route path="blogs/posts" element={<Posts />} />
            <Route path="blogs/posts/:id" element={<PostEditor />} />
            <Route path="blogs/categories" element={<Categories />} />
            <Route path="blogs/page" element={<BlogPage />} />
            <Route path="seo/pages" element={<SeoPages />} />
            <Route path="seo/pages/:pageKey" element={<SeoPageForm />} />
            <Route path="seo/site" element={<SiteSettings />} />
            <Route path="centres" element={<Centres />} />
            <Route path="centres/new" element={<CentreForm />} />
            <Route path="centres/:id" element={<CentreForm />} />
            <Route path="finder" element={<Finder />} />
            <Route path="defaults" element={<Defaults />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DialogProvider>
    </AuthProvider>
  );
}
