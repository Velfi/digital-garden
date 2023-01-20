import Head from 'next/head'
import Header from './Header'
import { siteConfig } from '@/siteconfig'

export default function Layout({ children }: React.PropsWithChildren<{}>) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="author" content={siteConfig.author} />
        <meta name="description" content={siteConfig.description} />
        <title>{siteConfig.title}</title>
      </Head>
      <Header />
      <main className="container">
        {children}
      </main>
    </>
  )
}