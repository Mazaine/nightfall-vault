import { HomeCategories } from "./home/HomeCategories";
import { HomeFeatured } from "./home/HomeFeatured";
import { HomeHero } from "./home/HomeHero";

export function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeCategories />
      <HomeFeatured />
    </>
  );
}
