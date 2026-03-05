(function() {
    // Helper to load image as base64
    async function getBase64ImageFromUrl(url) {
        if (!url) return null;

        // If it's already base64 (local://...), handle it
        if (url.startsWith('local://')) {
            const imageId = url.replace('local://', '');
            const localData = localStorage.getItem(imageId);
            if (localData) {
                try {
                    const data = JSON.parse(localData);
                    return data.dataUrl;
                } catch (e) {
                    console.error('Failed to parse local image data', e);
                    return null;
                }
            }
            return null;
        }

        // If it's online
        try {
            // For Supabase storage URLs, we might need to handle CORS if not configured
            // But usually public buckets allow CORS.
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error('Failed to load image for PDF:', url, e);
            return null;
        }
    }

    async function rotateImageDataUrlLeft90(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return null;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.height;
                    canvas.height = img.width;
                    const ctx = canvas.getContext('2d');
                    ctx.translate(0, canvas.height);
                    ctx.rotate(-Math.PI / 2);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.95));
                } catch (e) {
                    resolve(dataUrl);
                }
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    async function loadImageSize(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    async function normalizeImageOrientationByAspect(dataUrl, targetWidth, targetHeight) {
        if (!dataUrl || !targetWidth || !targetHeight) return dataUrl;
        const size = await loadImageSize(dataUrl);
        if (!size || !size.width || !size.height) return dataUrl;

        const imageRatio = size.width / size.height;
        const targetRatio = targetWidth / targetHeight;
        const scoreNormal = Math.abs(Math.log(imageRatio / targetRatio));
        const scoreRotated = Math.abs(Math.log((1 / imageRatio) / targetRatio));

        if (scoreRotated < scoreNormal) {
            return await rotateImageDataUrlLeft90(dataUrl);
        }
        return dataUrl;
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function convertBbCodeToHtml(text) {
        if (!text) return '';
        let html = String(text);
        html = html.replace(/\[b\]/gi, '<b>');
        html = html.replace(/\[\/b\]/gi, '</b>');
        html = html.replace(/\[i\]/gi, '<i>');
        html = html.replace(/\[\/i\]/gi, '</i>');
        html = html.replace(/\[u\]/gi, '<u>');
        html = html.replace(/\[\/u\]/gi, '</u>');
        html = html.replace(/\[align=(center|left|right)\]/gi, '<div style="text-align: $1;">');
        html = html.replace(/\[\/align\]/gi, '</div>');
        html = html.replace(/\[color=([^\]]+)\]/gi, '<span style="color: $1;">');
        html = html.replace(/\[\/color\]/gi, '</span>');
        html = html.replace(/\[size=(\d+)\]/gi, '<span style="font-size: $1px;">');
        html = html.replace(/\[\/size\]/gi, '</span>');
        html = html.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
        return html;
    }

    function normalizeLogContentToHtml(raw) {
        if (raw === null || raw === undefined) return '';
        const text = String(raw);
        const trimmed = text.trim();
        const looksLikeHtml = trimmed.startsWith('<') && trimmed.includes('>');
        const looksLikeBbCode = /\[[a-z]+(=[^\]]+)?\]|\[\/[a-z]+\]/i.test(trimmed);

        let html;
        if (looksLikeHtml) {
            html = trimmed;
        } else if (looksLikeBbCode) {
            html = convertBbCodeToHtml(trimmed);
        } else {
            html = escapeHtml(text).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
        }

        html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        return html;
    }

    function dataUrlToBase64(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return null;
        const idx = dataUrl.indexOf('base64,');
        if (idx === -1) return null;
        return dataUrl.substring(idx + 'base64,'.length);
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function crc32(bytes) {
        let crc = 0 ^ -1;
        for (let i = 0; i < bytes.length; i++) {
            crc = (crc >>> 8) ^ crc32.table[(crc ^ bytes[i]) & 0xff];
        }
        return (crc ^ -1) >>> 0;
    }

    crc32.table = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    function createZipBlob(files) {
        const encoder = new TextEncoder();
        const parts = [];
        const centralParts = [];
        let offset = 0;

        const UTF8_FLAG = 0x0800;
        const METHOD_STORE = 0;

        for (const f of files) {
            const nameBytes = encoder.encode(f.name);
            const dataBytes = typeof f.data === 'string' ? encoder.encode(f.data) : f.data;
            const crc = crc32(dataBytes);
            const size = dataBytes.length;

            const localHeader = new Uint8Array(30);
            const localView = new DataView(localHeader.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, UTF8_FLAG, true);
            localView.setUint16(8, METHOD_STORE, true);
            localView.setUint16(10, 0, true);
            localView.setUint16(12, 0, true);
            localView.setUint32(14, crc, true);
            localView.setUint32(18, size, true);
            localView.setUint32(22, size, true);
            localView.setUint16(26, nameBytes.length, true);
            localView.setUint16(28, 0, true);

            parts.push(localHeader, nameBytes, dataBytes);

            const centralHeader = new Uint8Array(46);
            const centralView = new DataView(centralHeader.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, UTF8_FLAG, true);
            centralView.setUint16(10, METHOD_STORE, true);
            centralView.setUint16(12, 0, true);
            centralView.setUint16(14, 0, true);
            centralView.setUint32(16, crc, true);
            centralView.setUint32(20, size, true);
            centralView.setUint32(24, size, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, offset, true);

            centralParts.push(centralHeader, nameBytes);

            offset += localHeader.length + nameBytes.length + size;
        }

        const centralDirOffset = offset;
        for (const p of centralParts) {
            parts.push(p);
            offset += p.length;
        }

        const centralDirSize = offset - centralDirOffset;
        const fileCount = files.length;

        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, fileCount, true);
        endView.setUint16(10, fileCount, true);
        endView.setUint32(12, centralDirSize, true);
        endView.setUint32(16, centralDirOffset, true);
        endView.setUint16(20, 0, true);
        parts.push(end);

        return new Blob(parts, { type: 'application/zip' });
    }

    function createDocxFromMht(mhtContent) {
        const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
            `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
            `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
            `  <Default Extension="xml" ContentType="application/xml"/>\n` +
            `  <Default Extension="mht" ContentType="message/rfc822"/>\n` +
            `  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n` +
            `  <Override PartName="/word/afchunk.mht" ContentType="message/rfc822"/>\n` +
            `</Types>`;

        const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
            `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n` +
            `</Relationships>`;

        const a4W = 11906;
        const a4H = 16838;
        const marginTwips = 567;
        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
            `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n` +
            `  <w:body>\n` +
            `    <w:altChunk r:id="rId1"/>\n` +
            `    <w:sectPr>\n` +
            `      <w:pgSz w:w="${a4W}" w:h="${a4H}"/>\n` +
            `      <w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="0" w:footer="0" w:gutter="0"/>\n` +
            `    </w:sectPr>\n` +
            `  </w:body>\n` +
            `</w:document>`;

        const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
            `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.mht"/>\n` +
            `</Relationships>`;

        const zip = createZipBlob([
            { name: '[Content_Types].xml', data: contentTypesXml },
            { name: '_rels/.rels', data: relsXml },
            { name: 'word/document.xml', data: documentXml },
            { name: 'word/_rels/document.xml.rels', data: documentRelsXml },
            { name: 'word/afchunk.mht', data: mhtContent }
        ]);

        return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }

    function xmlEscape(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function normalizeLogContentToPlainText(raw) {
        const html = normalizeLogContentToHtml(raw);
        let text = String(html);
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
        text = text.replace(/<[^>]+>/g, '');
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'');
        text = text.replace(/\r\n/g, '\n');
        text = text.replace(/\n{3,}/g, '\n\n');
        return text.trim();
    }

    function parseHtmlParagraphsWithAlignment(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(String(html || ''), 'text/html');
            const body = doc.body;
            const result = [];

            function getAlignFromElement(el, fallback) {
                if (!el || el.nodeType !== 1) return fallback;
                const style = (el.getAttribute('style') || '').toLowerCase();
                const alignAttr = (el.getAttribute('align') || '').toLowerCase();
                const direct = style.match(/text-align\s*:\s*(left|center|right)/);
                const align = direct ? direct[1] : (alignAttr === 'left' || alignAttr === 'center' || alignAttr === 'right' ? alignAttr : null);
                return align || fallback;
            }

            function walk(node, inheritedAlign) {
                if (!node) return;
                if (node.nodeType === 3) {
                    const t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
                    if (t) {
                        result.push({ text: t, align: inheritedAlign || 'left' });
                    }
                    return;
                }

                if (node.nodeType !== 1) return;

                const tag = node.tagName ? node.tagName.toLowerCase() : '';
                const isBlock = ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
                const currentAlign = getAlignFromElement(node, inheritedAlign || 'left');

                if (isBlock) {
                    const innerText = (node.innerText || '').replace(/\r\n/g, '\n');
                    const lines = innerText.split('\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length === 0) {
                        result.push({ text: '', align: currentAlign });
                    } else {
                        for (const line of lines) {
                            result.push({ text: line, align: currentAlign });
                        }
                    }
                    return;
                }

                for (const child of Array.from(node.childNodes)) {
                    walk(child, currentAlign);
                }
            }

            for (const child of Array.from(body.childNodes)) {
                walk(child, 'left');
            }

            return result.length > 0 ? result : [{ text: normalizeLogContentToPlainText(html), align: 'left' }];
        } catch (e) {
            return [{ text: normalizeLogContentToPlainText(html), align: 'left' }];
        }
    }

    function parseLogContentToParagraphs(raw) {
        if (raw === null || raw === undefined) return [{ text: '', align: 'left' }];
        const text = String(raw);
        const trimmed = text.trim();
        const looksLikeHtml = trimmed.startsWith('<') && trimmed.includes('>');
        const looksLikeBbCode = /\[[a-z]+(=[^\]]+)?\]|\[\/[a-z]+\]/i.test(trimmed);

        if (looksLikeHtml) {
            return parseHtmlParagraphsWithAlignment(trimmed);
        }
        if (looksLikeBbCode) {
            const html = convertBbCodeToHtml(trimmed);
            return parseHtmlParagraphsWithAlignment(html);
        }
        const plain = text.replace(/\r\n/g, '\n');
        const lines = plain.split('\n');
        const out = [];
        for (const line of lines) {
            const t = line.trim();
            if (t) out.push({ text: t, align: 'left' });
        }
        return out.length > 0 ? out : [{ text: '', align: 'left' }];
    }

    function buildWordParagraphsFromParagraphList(paragraphs, options = {}) {
        const bold = !!options.bold;
        const fontSizeHalfPoints = options.fontSizeHalfPoints || 32;
        const lineHeightTwips = options.lineHeightTwips || 360;
        const spacingBeforeTwips = options.spacingBeforeTwips || 0;
        const spacingAfterTwips = options.spacingAfterTwips || 0;

        const paras = [];
        for (const p of paragraphs || []) {
            const align = p.align || 'left';
            const jc = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');
            const escaped = xmlEscape(p.text || '');
            paras.push(
                `<w:p>` +
                `<w:pPr><w:jc w:val="${jc}"/><w:spacing w:before="${spacingBeforeTwips}" w:after="${spacingAfterTwips}" w:line="${lineHeightTwips}" w:lineRule="exact"/></w:pPr>` +
                `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="SimSun"/><w:sz w:val="${fontSizeHalfPoints}"/><w:szCs w:val="${fontSizeHalfPoints}"/></w:rPr>` +
                `<w:t xml:space="preserve">${escaped || ' '}</w:t></w:r>` +
                `</w:p>`
            );
        }
        return paras.length > 0 ? paras.join('') : '<w:p/>';
    }

    function buildWordParagraphsFromText(text, options = {}) {
        const lines = String(text || '').split('\n');
        const paras = [];
        const align = options.align || 'left';
        const bold = !!options.bold;
        const fontSizeHalfPoints = options.fontSizeHalfPoints || 32;
        const lineHeightTwips = options.lineHeightTwips || 360;
        const spacingBeforeTwips = options.spacingBeforeTwips || 0;
        const spacingAfterTwips = options.spacingAfterTwips || 0;

        for (const line of lines) {
            const escaped = xmlEscape(line);
            const jc = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');
            paras.push(
                `<w:p>` +
                `<w:pPr><w:jc w:val="${jc}"/><w:spacing w:before="${spacingBeforeTwips}" w:after="${spacingAfterTwips}" w:line="${lineHeightTwips}" w:lineRule="exact"/></w:pPr>` +
                `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="SimSun"/><w:sz w:val="${fontSizeHalfPoints}"/><w:szCs w:val="${fontSizeHalfPoints}"/></w:rPr>` +
                `<w:t xml:space="preserve">${escaped || ' '}</w:t></w:r>` +
                `</w:p>`
            );
        }
        return paras.join('');
    }

    function buildWordTableXml(model) {
        const tblW = model.tableWidthTwips;
        const gridCols = model.gridColsTwips;

        const tblGrid = gridCols.map(w => `<w:gridCol w:w="${w}"/>`).join('');

        const rowsXml = model.rows.map(r => {
            const trPr = `<w:trPr><w:cantSplit/><w:trHeight w:val="${r.heightTwips}" w:hRule="exact"/></w:trPr>`;
            const cellsXml = r.cells.map(c => {
                const gridSpan = c.gridSpan && c.gridSpan > 1 ? `<w:gridSpan w:val="${c.gridSpan}"/>` : '';
                const vMerge = c.vMerge ? `<w:vMerge w:val="${c.vMerge}"/>` : '';
                const tcW = `<w:tcW w:w="${c.tcWidthTwips || 0}" w:type="dxa"/>`;
                const tcBorders = `<w:tcBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:tcBorders>`;
                const vAlign = `<w:vAlign w:val="${c.vAlign || 'center'}"/>`;
                const tcPr = `<w:tcPr>${tcW}${gridSpan}${vMerge}${vAlign}${tcBorders}</w:tcPr>`;
                const inner = c.innerXml || '<w:p/>';
                return `<w:tc>${tcPr}${inner}</w:tc>`;
            }).join('');
            return `<w:tr>${trPr}${cellsXml}</w:tr>`;
        }).join('');

        return `<w:tbl>` +
            `<w:tblPr>` +
            `<w:tblW w:w="${tblW}" w:type="dxa"/>` +
            `<w:tblLayout w:type="fixed"/>` +
            `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>` +
            `</w:tblPr>` +
            `<w:tblGrid>${tblGrid}</w:tblGrid>` +
            `${rowsXml}` +
            `</w:tbl>`;
    }

    function buildVmlImageXml(rId, widthPt, heightPt) {
        const w = Math.max(1, Math.round(widthPt));
        const h = Math.max(1, Math.round(heightPt));
        return `<w:p>` +
            `<w:pPr><w:jc w:val="center"/></w:pPr>` +
            `<w:r>` +
            `<w:pict>` +
            `<v:shape type="#_x0000_t75" style="width:${w}pt;height:${h}pt" stroked="f">` +
            `<v:imagedata r:id="${rId}" o:title=""/>` +
            `</v:shape>` +
            `</w:pict>` +
            `</w:r>` +
            `</w:p>`;
    }

    function buildNativeConstructionLogDocx(logs, docxOptions) {
        const a4W = 11906;
        const a4H = 16838;
        const marginTwips = 850;
        const contentWidthTwips = a4W - 2 * marginTwips;

        const fontNormal = 30;
        const fontTitle = 54;
        const fontSectionTitle = 34;
        const fontSmall = 26;

        const gridPercents = [11.04, 17.61, 8.48, 9.49, 4.92, 11.45, 1.42, 7.46, 9.91, 8.48, 9.74];
        let gridColsTwips = gridPercents.map(p => Math.round((p / 100) * contentWidthTwips));
        const diff = contentWidthTwips - gridColsTwips.reduce((a, b) => a + b, 0);
        gridColsTwips[gridColsTwips.length - 1] += diff;

        const ptPerMm = 72 / 25.4;
        const wordImageCellHeightMm = docxOptions.wordImageCellHeightMm;
        const wordLogContentHeightMm = docxOptions.wordLogContentHeightMm;
        const imageCellHeightPt = wordImageCellHeightMm * ptPerMm;

        const bodyParts = [];

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            const date = new Date(log.record_date);
            const weekDay = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

            const title = buildWordParagraphsFromText('施工日志', { align: 'center', bold: true, fontSizeHalfPoints: fontTitle, lineHeightTwips: 620, spacingBeforeTwips: 220, spacingAfterTwips: 160 });

            const paragraphs = parseLogContentToParagraphs(log.log_content || '');
            const maxChars = 900;
            let used = 0;
            const clippedParas = [];
            for (const p of paragraphs) {
                const t = String(p.text || '');
                if (!t) continue;
                if (used >= maxChars) break;
                const remain = maxChars - used;
                if (t.length <= remain) {
                    clippedParas.push({ text: t, align: p.align || 'left' });
                    used += t.length;
                } else {
                    clippedParas.push({ text: t.slice(0, Math.max(0, remain)) + '…（内容过长已截断）', align: p.align || 'left' });
                    used = maxChars;
                    break;
                }
            }
            const contentInner = buildWordParagraphsFromParagraphList(clippedParas.length > 0 ? clippedParas : [{ text: '', align: 'left' }], { bold: false, fontSizeHalfPoints: fontNormal, lineHeightTwips: 340 });

            const weather = docxOptions.parseWeather(log.weather_info);

            const imageInfo = docxOptions.imagesByIndex[i] || null;
            let imageInner;
            if (imageInfo && imageInfo.rId) {
                const ratio = imageInfo.width && imageInfo.height ? (imageInfo.width / imageInfo.height) : 1;
                const cellWidthTwips = gridColsTwips.slice(1).reduce((a, b) => a + b, 0);
                const cellWidthPt = (cellWidthTwips / 20);
                const desiredWidthPt = imageCellHeightPt * ratio;
                const finalWidthPt = Math.min(cellWidthPt, desiredWidthPt);
                const finalHeightPt = finalWidthPt === desiredWidthPt ? imageCellHeightPt : (finalWidthPt / ratio);
                imageInner = buildVmlImageXml(imageInfo.rId, finalWidthPt, finalHeightPt);
            } else {
                imageInner = buildWordParagraphsFromText('无图片', { align: 'center', bold: false, fontSizeHalfPoints: fontSmall, lineHeightTwips: 340 });
            }

            const rows = [
                {
                    heightTwips: 680,
                    cells: [
                        { innerXml: buildWordParagraphsFromText('日期', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[0] },
                        { innerXml: buildWordParagraphsFromText(dateStr, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[1] },
                        { innerXml: buildWordParagraphsFromText('星期', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[2] },
                        { innerXml: buildWordParagraphsFromText(weekDay, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), gridSpan: 3, tcWidthTwips: gridColsTwips[3] + gridColsTwips[4] + gridColsTwips[5] },
                        { innerXml: buildWordParagraphsFromText('气温', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), gridSpan: 3, tcWidthTwips: gridColsTwips[6] + gridColsTwips[7] + gridColsTwips[8] },
                        { innerXml: buildWordParagraphsFromText('气象', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), gridSpan: 2, tcWidthTwips: gridColsTwips[9] + gridColsTwips[10] }
                    ]
                },
                {
                    heightTwips: 680,
                    cells: [
                        { innerXml: buildWordParagraphsFromText('项 目\n\n名 称', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), vMerge: 'restart', tcWidthTwips: gridColsTwips[0] },
                        { innerXml: buildWordParagraphsFromText(docxOptions.projectName, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), vMerge: 'restart', gridSpan: 2, tcWidthTwips: gridColsTwips[1] + gridColsTwips[2] },
                        { innerXml: buildWordParagraphsFromText('施工人数', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), gridSpan: 2, tcWidthTwips: gridColsTwips[3] + gridColsTwips[4] },
                        { innerXml: buildWordParagraphsFromText('班组长', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[5] },
                        { innerXml: buildWordParagraphsFromText('上午', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), gridSpan: 2, tcWidthTwips: gridColsTwips[6] + gridColsTwips[7] },
                        { innerXml: buildWordParagraphsFromText('下午', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[8] },
                        { innerXml: buildWordParagraphsFromText('上午', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[9] },
                        { innerXml: buildWordParagraphsFromText('下午', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[10] }
                    ]
                },
                {
                    heightTwips: 680,
                    cells: [
                        { innerXml: '<w:p/>', vMerge: 'continue', tcWidthTwips: gridColsTwips[0] },
                        { innerXml: '<w:p/>', vMerge: 'continue', gridSpan: 2, tcWidthTwips: gridColsTwips[1] + gridColsTwips[2] },
                        { innerXml: '<w:p/>', gridSpan: 2, tcWidthTwips: gridColsTwips[3] + gridColsTwips[4] },
                        { innerXml: buildWordParagraphsFromText('黄万秋', { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[5] },
                        { innerXml: buildWordParagraphsFromText(`${weather.am.temp || ''}℃`, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), gridSpan: 2, tcWidthTwips: gridColsTwips[6] + gridColsTwips[7] },
                        { innerXml: buildWordParagraphsFromText(`${weather.pm.temp || ''}℃`, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[8] },
                        { innerXml: buildWordParagraphsFromText(`${weather.am.weather || ''}`, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[9] },
                        { innerXml: buildWordParagraphsFromText(`${weather.pm.weather || ''}`, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[10] }
                    ]
                },
                {
                    heightTwips: 560,
                    cells: [
                        { innerXml: buildWordParagraphsFromText('施工内容', { align: 'center', bold: true, fontSizeHalfPoints: fontSectionTitle }), gridSpan: 11, tcWidthTwips: contentWidthTwips }
                    ]
                },
                {
                    heightTwips: Math.round(wordLogContentHeightMm * 56.6929),
                    cells: [
                        { innerXml: contentInner, gridSpan: 11, vAlign: 'top', tcWidthTwips: contentWidthTwips }
                    ]
                },
                {
                    heightTwips: Math.round(wordImageCellHeightMm * 56.6929),
                    cells: [
                        { innerXml: buildWordParagraphsFromText('施工\n\n图片', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[0] },
                        { innerXml: imageInner, gridSpan: 10, vAlign: 'top', tcWidthTwips: contentWidthTwips - gridColsTwips[0] }
                    ]
                },
                {
                    heightTwips: 850,
                    cells: [
                        { innerXml: buildWordParagraphsFromText('工长', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), tcWidthTwips: gridColsTwips[0] },
                        { innerXml: '<w:p/>', gridSpan: 3, tcWidthTwips: gridColsTwips[1] + gridColsTwips[2] + gridColsTwips[3] },
                        { innerXml: buildWordParagraphsFromText('记录员', { align: 'center', bold: true, fontSizeHalfPoints: fontNormal }), gridSpan: 3, tcWidthTwips: gridColsTwips[4] + gridColsTwips[5] + gridColsTwips[6] },
                        { innerXml: buildWordParagraphsFromText(docxOptions.userName, { align: 'center', bold: false, fontSizeHalfPoints: fontNormal }), gridSpan: 4, tcWidthTwips: gridColsTwips[7] + gridColsTwips[8] + gridColsTwips[9] + gridColsTwips[10] }
                    ]
                }
            ];

            const tableXml = buildWordTableXml({ tableWidthTwips: contentWidthTwips, gridColsTwips, rows });
            bodyParts.push(title, tableXml);
            if (i !== logs.length - 1) {
                bodyParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
            }
        }

        const documentXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
            `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
            `xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">` +
            `<w:body>` +
            bodyParts.join('') +
            `<w:sectPr>` +
            `<w:pgSz w:w="${a4W}" w:h="${a4H}"/>` +
            `<w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="0" w:footer="0" w:gutter="0"/>` +
            `</w:sectPr>` +
            `</w:body></w:document>`;

        const relsXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            docxOptions.relationshipsXml +
            `</Relationships>`;

        const relsRootXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
            `</Relationships>`;

        const contentTypesXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
            `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
            `<Default Extension="xml" ContentType="application/xml"/>` +
            `<Default Extension="jpg" ContentType="image/jpeg"/>` +
            `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
            `</Types>`;

        const files = [
            { name: '[Content_Types].xml', data: contentTypesXml },
            { name: '_rels/.rels', data: relsRootXml },
            { name: 'word/document.xml', data: documentXml },
            { name: 'word/_rels/document.xml.rels', data: relsXml }
        ];

        for (const media of docxOptions.mediaFiles) {
            files.push(media);
        }

        const zipBlob = createZipBlob(files);
        return new Blob([zipBlob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }

    async function ensureJpegDataUrl(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return null;
        if (dataUrl.startsWith('data:image/jpeg')) return dataUrl;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.95));
                } catch (e) {
                    resolve(dataUrl);
                }
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    async function exportConstructionLogsFromData(logs, options = {}) {
        if (!window.jspdf || !window.html2canvas) {
            alert('PDF生成组件未加载，请检查网络或刷新页面');
            return;
        }

        if (!Array.isArray(logs) || logs.length === 0) {
            alert('没有可导出的施工日志');
            return;
        }

        const projectNameInput = document.getElementById('projectName');
        const projectName = options.projectName || (projectNameInput ? projectNameInput.value : (localStorage.getItem('currentProjectName') || '未知项目'));

        let userName = options.userName || '张三';
        if (!options.userName) {
            try {
                const currentUserStr = localStorage.getItem('currentUser');
                if (currentUserStr) {
                    const currentUser = JSON.parse(currentUserStr);
                    if (currentUser.login_name) {
                        userName = currentUser.login_name;
                    }
                }
            } catch (e) {}
        }

        const fileName = options.fileName || `施工日志_${projectName}.pdf`;

        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; justify-content: center; align-items: center; color: white; flex-direction: column; font-size: 16px;';
        loadingDiv.innerHTML = '<div style="font-size: 20px; margin-bottom: 10px; font-weight: bold;">正在生成PDF...</div><div id="pdfProgress">准备中...</div>';
        document.body.appendChild(loadingDiv);

        const updateProgress = (text) => {
            const el = document.getElementById('pdfProgress');
            if (el) el.textContent = text;
        };

        let container = document.getElementById('pdf-render-container');
        if (container) document.body.removeChild(container);

        container = document.createElement('div');
        container.style.cssText = 'position: absolute; top: 0; left: -9999px; width: 794px; background: white; padding: 40px; box-sizing: border-box; font-family: "SimSun", "Songti SC", serif; z-index: -1;';
        container.id = 'pdf-render-container';
        document.body.appendChild(container);

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();

            const renderContainerWidth = 794;
            const renderContainerPadding = 40;
            const innerPadding = 20;
            const tableWidth = renderContainerWidth - 2 * (renderContainerPadding + innerPadding);
            const imageCellWidth = tableWidth * 0.8896;
            const imageCellHeight = 350;

            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                updateProgress(`正在处理第 ${i + 1} / ${logs.length} 条日志...`);

                let weather = { am: {}, pm: {} };
                if (log.weather_info) {
                    if (typeof log.weather_info === 'string' && window.constructionLogAPI && typeof window.constructionLogAPI.parseWeatherInfo === 'function') {
                        weather = window.constructionLogAPI.parseWeatherInfo(log.weather_info);
                    } else if (typeof log.weather_info === 'object') {
                        weather = log.weather_info;
                    }
                }

                const date = new Date(log.record_date);
                const weekDay = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

                let imagesHtml = '';
                if (log.image_ids && log.image_ids.length > 0) {
                    const imgUrl = log.image_ids[0];
                    const base64 = await getBase64ImageFromUrl(imgUrl);
                    const normalized = base64 ? await normalizeImageOrientationByAspect(base64, imageCellWidth, imageCellHeight) : null;
                    if (normalized) {
                        imagesHtml = `<img src="${normalized}" style="position: absolute; top: 0; bottom: 0; left: 50%; height: 100%; width: auto; transform: translateX(-50%); display: block;">`;
                    } else {
                        imagesHtml = '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #999;">无图片</div>';
                    }
                } else {
                    imagesHtml = '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #999;">无图片</div>';
                }

                const borderStyle = 'border: 1px solid black; padding: 4px; text-align: center; font-size: 17px; color: black; vertical-align: middle;';
                const headerStyle = 'font-weight: bold; background-color: #fff;';

                container.innerHTML = `
                    <div style="width: 100%; background: white; color: black; padding: 20px;">
                        <h1 style="text-align: center; margin-bottom: 20px; font-size: 32px; font-weight: bold; color: black; letter-spacing: 10px; font-family: 'SimSun', serif;">施工日志</h1>
                        <table style="width: 100%; border-collapse: collapse; border: 2px solid black; table-layout: fixed;">
                            <colgroup>
                                <col style="width: 11.04%;">
                                <col style="width: 17.61%;">
                                <col style="width: 8.48%;">
                                <col style="width: 9.49%;">
                                <col style="width: 4.92%;">
                                <col style="width: 11.45%;">
                                <col style="width: 1.42%;">
                                <col style="width: 7.46%;">
                                <col style="width: 9.91%;">
                                <col style="width: 8.48%;">
                                <col style="width: 9.74%;">
                            </colgroup>
                            <tr style="height: 40px;">
                                <td style="${borderStyle} ${headerStyle}">日期</td>
                                <td style="${borderStyle}">${dateStr}</td>
                                <td style="${borderStyle} ${headerStyle}">星期</td>
                                <td colspan="3" style="${borderStyle}">${weekDay}</td>
                                <td colspan="3" style="${borderStyle} ${headerStyle}">气温</td>
                                <td colspan="2" style="${borderStyle} ${headerStyle}">气象</td>
                            </tr>
                            <tr style="height: 40px;">
                                <td rowspan="2" style="${borderStyle} ${headerStyle}">项&nbsp;目<br><br>名&nbsp;称</td>
                                <td colspan="2" rowspan="2" style="${borderStyle} word-break: break-all;">${projectName}</td>
                                <td colspan="2" style="${borderStyle} ${headerStyle}">施工人数</td>
                                <td style="${borderStyle} ${headerStyle}">班组长</td>
                                <td colspan="2" style="${borderStyle} ${headerStyle}">上午</td>
                                <td style="${borderStyle} ${headerStyle}">下午</td>
                                <td style="${borderStyle} ${headerStyle}">上午</td>
                                <td style="${borderStyle} ${headerStyle}">下午</td>
                            </tr>
                            <tr style="height: 40px;">
                                <td colspan="2" style="${borderStyle}">&nbsp;</td>
                                <td style="${borderStyle}">黄万秋</td>
                                <td colspan="2" style="${borderStyle}">${weather.am.temp || ''}℃</td>
                                <td style="${borderStyle}">${weather.pm.temp || ''}℃</td>
                                <td style="${borderStyle}">${weather.am.weather || ''}</td>
                                <td style="${borderStyle}">${weather.pm.weather || ''}</td>
                            </tr>
                            <tr>
                                <td colspan="11" style="${borderStyle} padding: 8px; font-weight: bold; font-size: 19px;">施工内容</td>
                            </tr>
                            <tr>
                                <td colspan="11" style="${borderStyle} text-align: left; height: 400px; vertical-align: top; padding: 15px; line-height: 1.8; font-size: 17px;">
                                    <div style="width: 100%; height: 100%; word-break: break-word;">${normalizeLogContentToHtml(log.log_content || '')}</div>
                                </td>
                            </tr>
                            <tr>
                                <td style="${borderStyle} vertical-align: middle; ${headerStyle}">施工<br><br>图片</td>
                                <td colspan="10" style="${borderStyle} padding: 0; height: 350px; vertical-align: top; overflow: hidden; position: relative;">
                                    ${imagesHtml}
                                </td>
                            </tr>
                            <tr style="height: 50px;">
                                <td style="${borderStyle} ${headerStyle}">工长</td>
                                <td colspan="3" style="${borderStyle}"></td>
                                <td colspan="3" style="${borderStyle} ${headerStyle}">记录员</td>
                                <td colspan="4" style="${borderStyle}">${userName}</td>
                            </tr>
                        </table>
                    </div>
                `;

                const canvas = await window.html2canvas(container, {
                    scale: 3,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });

                const imgData = canvas.toDataURL('image/png');
                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pageWidth - 40;
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                if (i > 0) {
                    pdf.addPage();
                }
                pdf.addImage(imgData, 'PNG', 20, 30, pdfWidth, pdfHeight);
            }

            updateProgress('正在保存PDF文件...');
            
            // 尝试使用文件保存对话框
            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [
                            { accept: { 'application/pdf': ['.pdf'] } }
                        ]
                    });
                    
                    // 获取PDF数据
                    const pdfData = pdf.output('blob');
                    const writable = await fileHandle.createWritable();
                    await writable.write(pdfData);
                    await writable.close();
                    return;
                } catch (err) {
                    // 用户取消保存或其他错误，使用默认保存方式
                    console.log('文件保存对话框错误:', err);
                }
            }
            
            // 默认保存方式
            pdf.save(fileName);
            setTimeout(() => {}, 0);
        } catch (error) {
            console.error('Export failed:', error);
            alert('导出过程中发生错误: ' + error.message);
        } finally {
            if (loadingDiv.parentNode) {
                document.body.removeChild(loadingDiv);
            }
            if (container.parentNode) {
                document.body.removeChild(container);
            }
        }
    }

    async function exportConstructionLogsWordFromData(logs, options = {}) {
        if (!Array.isArray(logs) || logs.length === 0) {
            alert('没有可导出的施工日志');
            return;
        }

        const projectNameInput = document.getElementById('projectName');
        const projectName = options.projectName || (projectNameInput ? projectNameInput.value : (localStorage.getItem('currentProjectName') || '未知项目'));

        let userName = options.userName || '张三';
        if (!options.userName) {
            try {
                const currentUserStr = localStorage.getItem('currentUser');
                if (currentUserStr) {
                    const currentUser = JSON.parse(currentUserStr);
                    if (currentUser.login_name) {
                        userName = currentUser.login_name;
                    }
                }
            } catch (e) {}
        }

        const fileName = options.fileName || `施工日志_${projectName}.docx`;

        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; justify-content: center; align-items: center; color: white; flex-direction: column; font-size: 16px;';
        loadingDiv.innerHTML = '<div style="font-size: 20px; margin-bottom: 10px; font-weight: bold;">正在生成Word...</div><div id="wordProgress">准备中...</div>';
        document.body.appendChild(loadingDiv);

        const updateProgress = (text) => {
            const el = document.getElementById('wordProgress');
            if (el) el.textContent = text;
        };

        const wordMarginMm = 10;
        const wordPageWidthMm = 210;
        const wordContentWidthMm = wordPageWidthMm - 2 * wordMarginMm;
        const wordImageCellWidthMm = wordContentWidthMm * 0.8896;
        const wordImageCellHeightMm = 85;
        const wordLogContentHeightMm = 95;

        try {
            const mediaFiles = [];
            let relationshipsXml = '';
            const imagesByIndex = {};
            let relId = 1;

            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                updateProgress(`正在处理第 ${i + 1} / ${logs.length} 条日志图片...`);

                if (log.image_ids && log.image_ids.length > 0) {
                    const imgUrl = log.image_ids[0];
                    const base64 = await getBase64ImageFromUrl(imgUrl);
                    const normalized = base64 ? await normalizeImageOrientationByAspect(base64, wordImageCellWidthMm, wordImageCellHeightMm) : null;
                    const jpeg = normalized ? await ensureJpegDataUrl(normalized) : null;
                    const jpegBase64 = jpeg ? dataUrlToBase64(jpeg) : null;
                    if (jpegBase64) {
                        const rId = `rId${relId++}`;
                        const fileName = `image_${i + 1}.jpg`;
                        const bytes = base64ToUint8Array(jpegBase64);
                        mediaFiles.push({ name: `word/media/${fileName}`, data: bytes });
                        relationshipsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`;

                        const size = await loadImageSize(jpeg);
                        imagesByIndex[i] = { rId, width: size?.width || 0, height: size?.height || 0 };
                    }
                }
            }

            const parseWeather = (weatherInfo) => {
                if (weatherInfo) {
                    if (typeof weatherInfo === 'string' && window.constructionLogAPI && typeof window.constructionLogAPI.parseWeatherInfo === 'function') {
                        return window.constructionLogAPI.parseWeatherInfo(weatherInfo);
                    }
                    if (typeof weatherInfo === 'object') {
                        return weatherInfo;
                    }
                }
                return { am: {}, pm: {} };
            };

            const docxBlob = buildNativeConstructionLogDocx(logs, {
                projectName,
                userName,
                mediaFiles,
                relationshipsXml,
                imagesByIndex,
                parseWeather,
                wordImageCellHeightMm,
                wordLogContentHeightMm
            });

            // 尝试使用文件保存对话框
            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [
                            { accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }
                        ]
                    });
                    
                    // 读取blob数据并写入文件
                    const arrayBuffer = await docxBlob.arrayBuffer();
                    const writable = await fileHandle.createWritable();
                    await writable.write(arrayBuffer);
                    await writable.close();
                    return;
                } catch (err) {
                    // 用户取消保存或其他错误，使用默认保存方式
                    console.log('文件保存对话框错误:', err);
                }
            }
            
            // 默认保存方式
            downloadBlob(docxBlob, fileName);
            setTimeout(() => {}, 0);
        } catch (error) {
            console.error('Export failed:', error);
            alert('导出过程中发生错误: ' + error.message);
        } finally {
            if (loadingDiv.parentNode) {
                document.body.removeChild(loadingDiv);
            }
        }
    }

    async function exportConstructionLogs(startDate, endDate) {
        const projectId = localStorage.getItem('currentProjectId');
        const projectNameInput = document.getElementById('projectName');
        const projectName = projectNameInput ? projectNameInput.value : (localStorage.getItem('currentProjectName') || '未知项目');
        
        // Get user name for "Recorder"
        let userName = '张三'; // Default
        try {
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                if (currentUser.login_name) {
                    userName = currentUser.login_name;
                }
            }
        } catch (e) {
            console.warn('Failed to get user name', e);
        }

        if (!projectId) {
            alert('未找到项目信息');
            return;
        }

        try {
            const logs = await window.constructionLogAPI.getConstructionLogs(projectId, { startDate, endDate });

            if (!logs || logs.length === 0) {
                alert('该时间段内没有施工日志');
                return;
            }
            const fileName = `施工日志_${projectName}_${startDate || '全部'}_${endDate || '全部'}.pdf`;
            await exportConstructionLogsFromData(logs, { projectName, userName, fileName });
        } catch (error) {
            console.error('Export failed:', error);
            alert('导出过程中发生错误: ' + error.message);
        }
    }

    // Expose to window
    window.exportConstructionLogs = exportConstructionLogs;
    window.exportConstructionLogsFromData = exportConstructionLogsFromData;
    window.exportConstructionLogsWordFromData = exportConstructionLogsWordFromData;
    window.exportConstructionLogsWord = async function(startDate, endDate) {
        const projectId = localStorage.getItem('currentProjectId');
        const projectNameInput = document.getElementById('projectName');
        const projectName = projectNameInput ? projectNameInput.value : (localStorage.getItem('currentProjectName') || '未知项目');
        if (!projectId) {
            alert('未找到项目信息');
            return;
        }
        const logs = await window.constructionLogAPI.getConstructionLogs(projectId, { startDate, endDate });
        if (!logs || logs.length === 0) {
            alert('该时间段内没有施工日志');
            return;
        }
        const fileName = `施工日志_${projectName}_${startDate || '全部'}_${endDate || '全部'}.docx`;
        await exportConstructionLogsWordFromData(logs, { projectName, fileName });
    };
    window.exportConstructionLog = async function(log) {
        if (!log) {
            alert('未找到当前施工日志');
            return;
        }
        const projectNameInput = document.getElementById('projectName');
        const projectName = projectNameInput ? projectNameInput.value : (localStorage.getItem('currentProjectName') || '未知项目');
        const dateStr = log.record_date || '未知日期';
        const fileName = `施工日志_${projectName}_${dateStr}.pdf`;
        await exportConstructionLogsFromData([log], { projectName, fileName });
    };
    window.exportConstructionLogWord = async function(log) {
        if (!log) {
            alert('未找到当前施工日志');
            return;
        }
        const projectNameInput = document.getElementById('projectName');
        const projectName = projectNameInput ? projectNameInput.value : (localStorage.getItem('currentProjectName') || '未知项目');
        const dateStr = log.record_date || '未知日期';
        const fileName = `施工日志_${projectName}_${dateStr}.docx`;
        await exportConstructionLogsWordFromData([log], { projectName, fileName });
    };
})();
