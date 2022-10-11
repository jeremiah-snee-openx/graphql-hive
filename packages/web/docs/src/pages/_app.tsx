import { ReactElement, useEffect } from 'react';
import { AppProps } from 'next/app';
import Script from 'next/script';
import Router from 'next/router';
import * as gtag from '../gtag';
import '@theguild/components/style.css';

// eslint-disable-next-line no-process-env
const CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;

export default function App({ Component, pageProps }: AppProps): ReactElement {
  useEffect(() => {
    Router.events.on('routeChangeComplete', gtag.pageview);
    Router.events.on('hashChangeComplete', gtag.pageview);
    return () => {
      Router.events.off('routeChangeComplete', gtag.pageview);
      Router.events.off('hashChangeComplete', gtag.pageview);
    };
  }, []);

  return (
    <>
      {gtag.GA_TRACKING_ID && (
        <Script strategy="afterInteractive" src={`https://googletagmanager.com/gtag/js?id=${gtag.GA_TRACKING_ID}`} />
      )}
      {gtag.GA_TRACKING_ID && (
        <Script
          id="gtag-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gtag.GA_TRACKING_ID}', { page_path: location.pathname });
          `,
          }}
        />
      )}
      {CRISP_WEBSITE_ID && (
        <Script
          id="crisp-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.$crisp = [];
                window.CRISP_WEBSITE_ID = '${CRISP_WEBSITE_ID}';
                (function () {
                  d = document;
                  s = d.createElement('script');
                  s.src = 'https://client.crisp.chat/l.js';
                  s.async = 1;
                  d.getElementsByTagName('head')[0].appendChild(s);
                })();

                window.$crisp.push(['set', 'session:segments', [['hive-docs']]]);
              }
            `,
          }}
        />
      )}
      <Component {...pageProps} />
    </>
  );
}
