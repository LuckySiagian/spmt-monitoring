package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/chromedp/chromedp"
)

func main() {
	urls := []string{
		"https://www.google.com",
		"https://gen-c.pelindo.co.id/login.aspx",
		"https://peluit.pelindo.co.id",
	}

	for _, u := range urls {
		fmt.Printf("\n=== Testing Chrome Bot to: %s ===\n", u)
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		
		opts := append(chromedp.DefaultExecAllocatorOptions[:],
			chromedp.DisableGPU,
			chromedp.NoSandbox,
			chromedp.Headless,
			chromedp.Flag("ignore-certificate-errors", "true"),
			chromedp.Flag("disable-web-security", "true"),
		)

		allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
		chromeCtx, cancelChrome := chromedp.NewContext(allocCtx)

		var pageText string
		var pageTitle string
		var buf []byte

		start := time.Now()
		err := chromedp.Run(chromeCtx,
			chromedp.Navigate(u),
			chromedp.Sleep(2*time.Second),
			chromedp.Title(&pageTitle),
			chromedp.Evaluate(`document.body.innerText`, &pageText),
			chromedp.CaptureScreenshot(&buf),
		)
		duration := time.Since(start)

		if err != nil {
			fmt.Printf("FAIL: Error running chromedp: %v (Took: %v)\n", err, duration)
		} else {
			fmt.Printf("SUCCESS: Title: '%s', Screenshot size: %d bytes (Took: %v)\n", pageTitle, len(buf), duration)
			if len(buf) > 0 {
				base64Str := base64.StdEncoding.EncodeToString(buf)
				fmt.Printf("Screenshot Base64 preview (first 50 chars): %s...\n", base64Str[:50])
			}
		}

		cancelChrome()
		cancelAlloc()
		cancel()
	}
}
