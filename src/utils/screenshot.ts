import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger';

export interface ScreenshotOptions {
  viewportWidth?: number;
  viewportHeight?: number;
  waitAfterLoad?: number;
}

export interface ScreenshotResult {
  url: string;
  filePath: string;
  filename: string;
  success: boolean;
  error?: string;
}

export class ScreenshotService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Capture full-page screenshots for a list of URLs.
   * Each URL is handled independently — a failure on one does not affect others.
   */
  async captureScreenshots(
    urls: string[],
    filenamePrefix: string,
    label: string,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult[]> {
    if (urls.length === 0) {
      return [];
    }

    const {
      viewportWidth = 1280,
      viewportHeight = 800,
      waitAfterLoad = 2000,
    } = options;

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jcb-screenshots-'));
    const results: ScreenshotResult[] = [];

    let puppeteer: typeof import('puppeteer');
    try {
      puppeteer = await import('puppeteer');
    } catch {
      this.logger.warn('Puppeteer not available — skipping screenshots');
      return urls.map(url => ({
        url,
        filePath: '',
        filename: '',
        success: false,
        error: 'Puppeteer not installed',
      }));
    }

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const suffix = urls.length > 1 ? `-${i + 1}` : '';
        const filename = `${filenamePrefix}-${label}${suffix}.png`;
        const filePath = path.join(outputDir, filename);

        try {
          this.logger.info(`Capturing ${label} screenshot: ${url}`);
          const page = await browser.newPage();

          await page.setViewport({
            width: viewportWidth,
            height: viewportHeight,
          });

          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000,
          });

          // Extra wait for SPAs that render after network idle
          if (waitAfterLoad > 0) {
            await new Promise(resolve => setTimeout(resolve, waitAfterLoad));
          }

          await page.screenshot({
            path: filePath,
            fullPage: true,
          });

          await page.close();

          results.push({ url, filePath, filename, success: true });
          this.logger.success(`Screenshot saved: ${filename}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to capture screenshot for ${url}: ${message}`);
          results.push({
            url,
            filePath: '',
            filename,
            success: false,
            error: message,
          });
        }
      }
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore browser close errors
        }
      }
    }

    return results;
  }

  /**
   * Clean up temporary screenshot files.
   */
  cleanup(results: ScreenshotResult[]): void {
    for (const result of results) {
      if (result.success && result.filePath && fs.existsSync(result.filePath)) {
        try {
          fs.unlinkSync(result.filePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
