import Header from '../components/Header'
import Hero from '../components/Hero'
import Categories from '../components/Categories'
import HowItWorks from '../components/HowItWorks'
import Faq from '../components/Faq'
import Benefits from '../components/Benefits'
import LaunchCta from '../components/LaunchCta'
import Footer from '../components/Footer'
import StickyCta from '../components/StickyCta'

export default function Landing() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Categories />
        <HowItWorks />
        <Benefits />
        <Faq />
        <LaunchCta />
      </main>
      <Footer />
      <StickyCta />
    </>
  )
}
