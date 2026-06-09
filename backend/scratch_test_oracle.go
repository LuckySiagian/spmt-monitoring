package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

func main() {
	u := "https://www.oracle.com"
	fmt.Printf("\n=== Testing Advanced Chrome Bot to: %s ===\n", u)
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()

	// 1. Build custom options that exclude EnableAutomation and specify headless=new
	opts := []chromedp.ExecAllocatorOption{
		chromedp.NoSandbox,
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("headless", "new"), // Use newer headless engine
		chromedp.Flag("disable-background-networking", true),
		chromedp.Flag("enable-features", "NetworkService,NetworkServiceInProcess"),
		chromedp.Flag("disable-background-timer-throttling", true),
		chromedp.Flag("disable-backgrounding-occluded-windows", true),
		chromedp.Flag("disable-breakpad", true),
		chromedp.Flag("disable-client-side-phishing-detection", true),
		chromedp.Flag("disable-default-apps", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-features", "site-per-process,Translate,BlinkGenPropertyTrees"),
		chromedp.Flag("disable-hang-monitor", true),
		chromedp.Flag("disable-ipc-flooding-protection", true),
		chromedp.Flag("disable-popup-blocking", true),
		chromedp.Flag("disable-prompt-on-repost", true),
		chromedp.Flag("disable-renderer-backgrounding", true),
		chromedp.Flag("disable-sync", true),
		chromedp.Flag("force-color-profile", "srgb"),
		chromedp.Flag("metrics-recording-only", true),
		chromedp.Flag("safebrowsing-disable-auto-update", true),
		chromedp.Flag("password-store", "basic"),
		chromedp.Flag("use-mock-keychain", true),

		chromedp.Flag("ignore-certificate-errors", "true"),
		chromedp.Flag("disable-web-security", "true"),
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.217 Safari/537.36"),
		chromedp.Flag("window-size", "1920,1080"),
	}

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	defer cancelAlloc()

	chromeCtx, cancelChrome := chromedp.NewContext(allocCtx)
	defer cancelChrome()

	var pageText string
	var pageTitle string
	var buf []byte

	start := time.Now()
	err := chromedp.Run(chromeCtx,
		chromedp.ActionFunc(func(ctx context.Context) error {
			_, err := page.AddScriptToEvaluateOnNewDocument(`
				// 1. Overwrite navigator.webdriver to undefined
				Object.defineProperty(navigator, 'webdriver', {
					get: () => undefined
				});

				// 2. Mock navigator.plugins to be non-empty
				if (typeof PluginArray !== 'undefined') {
					const mockPlugins = [
						{ name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
						{ name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
					];
					const pluginList = [];
					for (let i = 0; i < mockPlugins.length; i++) {
						const p = mockPlugins[i];
						const plugin = Object.create(Plugin.prototype);
						Object.defineProperties(plugin, {
							name: { get: () => p.name },
							filename: { get: () => p.filename },
							description: { get: () => p.description },
							length: { get: () => 0 }
						});
						pluginList.push(plugin);
					}
					Object.defineProperty(navigator, 'plugins', {
						get: () => {
							const list = [...pluginList];
							Object.defineProperty(list, 'length', { get: () => mockPlugins.length });
							list.item = (index) => list[index];
							list.namedItem = (name) => list.find(p => p.name === name);
							return list;
						}
					});
				}

				// 3. Mock languages
				Object.defineProperty(navigator, 'languages', {
					get: () => ['en-US', 'en']
				});

				// 4. Mock window.chrome
				window.chrome = {
					app: {
						isInstalled: false,
						InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
						RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
					},
					runtime: {
						OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
						OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
						PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
						PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
						PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
						RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
					}
				};

				// 5. Mock WebGL vendor/renderer
				if (typeof WebGLRenderingContext !== 'undefined') {
					const getParameter = WebGLRenderingContext.prototype.getParameter;
					WebGLRenderingContext.prototype.getParameter = function(parameter) {
						// UNMASKED_VENDOR_WEBGL = 0x9245, UNMASKED_RENDERER_WEBGL = 0x9246
						if (parameter === 0x9245) {
							return 'Intel Inc.';
						}
						if (parameter === 0x9246) {
							return 'Intel(R) UHD Graphics 620';
						}
						return getParameter.apply(this, arguments);
					};
				}

				// 6. Spoof navigator.userAgentData to match Chrome 148
				if (navigator.userAgentData) {
					const mockData = {
						brands: [
							{ brand: 'Google Chrome', version: '148' },
							{ brand: 'Not(A:Brand', version: '8' },
							{ brand: 'Chromium', version: '148' }
						],
						mobile: false,
						platform: 'Windows'
					};
					Object.defineProperty(navigator, 'userAgentData', {
						get: () => mockData
					});
				}
			`).Do(ctx)
			return err
		}),
		chromedp.Navigate(u),
		chromedp.Sleep(4*time.Second),
		chromedp.Title(&pageTitle),
		chromedp.Evaluate(`document.body.innerText`, &pageText),
		chromedp.CaptureScreenshot(&buf),
	)
	duration := time.Since(start)

	if err != nil {
		fmt.Printf("FAIL: Error running chromedp: %v (Took: %v)\n", err, duration)
		os.Exit(1)
	}

	fmt.Printf("SUCCESS: Title: '%s', Screenshot size: %d bytes (Took: %v)\n", pageTitle, len(buf), duration)
	
	// Write screenshot file to verify visually if it is the normal page or error
	err = os.WriteFile("scratch_oracle_result.png", buf, 0644)
	if err != nil {
		fmt.Println("Error writing result screenshot:", err)
	} else {
		fmt.Println("Wrote result screenshot to scratch_oracle_result.png")
	}

	if len(pageText) > 200 {
		fmt.Printf("Page Text Preview: %s\n", pageText[:200])
	} else {
		fmt.Printf("Page Text: %s\n", pageText)
	}
}
