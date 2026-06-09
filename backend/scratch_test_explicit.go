package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"time"

	"github.com/chromedp/chromedp"
)

func main() {
	u := "https://www.google.com"
	fmt.Printf("=== Testing Explicit Chrome Bot with Debug to: %s ===\n", u)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.DisableGPU,
		chromedp.NoSandbox,
		chromedp.Headless,
		chromedp.Flag("ignore-certificate-errors", "true"),
		chromedp.Flag("disable-web-security", "true"),
		chromedp.ExecPath(`C:\Program Files\Google\Chrome\Application\chrome.exe`),
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	defer cancelAlloc()

	// Added WithDebugf to see log output
	chromeCtx, cancelChrome := chromedp.NewContext(allocCtx, chromedp.WithDebugf(log.Printf))
	defer cancelChrome()

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
}
