import fs from 'node:fs';
import { URL } from 'node:url';

export const MAX_HTML_BYTES = 2 * 1024 * 1024;

export function readHTMLFile(file) {
    if (fs.statSync(file).size > MAX_HTML_BYTES) throw new Error('HTML exceeds 2 MiB limit');
    return fs.readFileSync(file, 'utf8');
}

export async function fetchPageHTML(input) {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTML URL must use HTTP or HTTPS');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(url, { signal: controller.signal, headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9'
        } });
        if (!response.ok) throw new Error(`HTML request failed: HTTP ${response.status}`);
        if (!['http:', 'https:'].includes(new URL(response.url).protocol)) {
            throw new Error('HTML redirect must use HTTP or HTTPS');
        }
        const type = response.headers.get('content-type') || '';
        if (type && !/\b(?:html|xml)\b/i.test(type)) throw new Error(`Expected HTML, got ${type}`);
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
            size += chunk.byteLength;
            if (size > MAX_HTML_BYTES) {
                controller.abort();
                throw new Error('HTML exceeds 2 MiB limit');
            }
            chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        const head = bytes.subarray(0, 1024).toString('latin1');
        const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] ||
            /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8';
        let html;
        try {
            html = new TextDecoder(charset).decode(bytes);
        } catch {
            html = bytes.toString('utf8');
        }
        return { html, url: response.url };
    } finally {
        clearTimeout(timer);
    }
}
