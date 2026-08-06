import { HomeFeatured } from "./home/HomeFeatured";
import { HomeHero } from "./home/HomeHero";
import { HomeWhatsNew } from "./home/HomeWhatsNew";

export function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeWhatsNew />
      <HomeFeatured />
    </>
  );
}
