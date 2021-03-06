import React from 'react';
import Document, { Head, Main, NextScript } from 'next/document';

export default class CustomDocument extends Document {
  render() {
    return (
      <html lang="en-US" className="h-full">
        <Head>
          <link href="https://unpkg.com/tailwindcss@^1.0/dist/tailwind.min.css" rel="stylesheet" />
          <link
            href="https://fonts.googleapis.com/css?family=Germania+One&display=swap"
            rel="stylesheet"
          />
        </Head>
        <body className="flex flex-col h-full">
          <style jsx global>{`
            #__next {
              height: 100%;
            }

            body,
            html {
              background-color: #e16a57;
              font-family: 'Germania One', sans-serif;
            }
          `}</style>
          <Main />
          <NextScript />
        </body>
      </html>
    );
  }
}
