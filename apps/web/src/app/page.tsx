import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Solution } from "@/components/Solution";
import { Features } from "@/components/Features";
import { DemoPreview } from "@/components/DemoPreview";
import { Waitlist } from "@/components/Waitlist";
import { About } from "@/components/About";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  return (
    <main>
      <Nav />
      <Hero />
      <Problem />
      <Solution />
      <Features />
      <DemoPreview />
      <Waitlist />
      <About />
      <Footer />
    </main>
  );
}
