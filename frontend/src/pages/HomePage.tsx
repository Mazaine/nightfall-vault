import { HomeFeatured } from "./home/HomeFeatured";
import { HomeHero } from "./home/HomeHero";
import { HomeWhatsNew } from "./home/HomeWhatsNew";
import { HomeDashboard } from "./home/HomeDashboard";

export function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeFeatured />
      <HomeWhatsNew />
      <HomeDashboard />
    </>
  );
}
