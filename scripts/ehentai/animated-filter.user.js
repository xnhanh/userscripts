// ==UserScript==
// @name         E-Hentai Gallery Animated Only (/g/)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Chặn load ảnh tĩnh tại trang /g/ và tự động chuyển trang cho tới khi gặp ảnh chuyển động (GIF, WebP, WebM, MP4)
// @author       XNhanhS & AI
// @match        *://e-hentai.org/g/*
// @match        *://exhentai.org/g/*
// @match        *://e-hentai.org/s/*
// @match        *://exhentai.org/s/*
// @icon         https://e-hentai.org/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    console.log('[EH-Filter] Script đã khởi động tại:', window.location.href);

    const path = window.location.pathname;

    /* =========================================================================
       1. TRANG GALLERY /g/
       ========================================================================= */
    if (path.startsWith('/g/')) {
        // Chờ DOM sẵn sàng
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initGalleryFilter);
        } else {
            initGalleryFilter();
        }
    }

    /* =========================================================================
       2. TRANG XEM ẢNH /s/
       ========================================================================= */
    if (path.startsWith('/s/')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initReaderAutoSkip);
        } else {
            initReaderAutoSkip();
        }
    }

    /* =========================================================================
       CHỨC NĂNG LỌC TẠI TRANG /g/
       ========================================================================= */
    function initGalleryFilter() {
        console.log('[EH-Filter] Đang kích hoạt bộ lọc cho trang /g/...');

        // Đọc cấu hình đã lưu
        let isFilterActive = GM_getValue('eh_g_filter_active', true);
        let includeWebp = GM_getValue('eh_include_webp', true);
        let autoNextTimer = null;
        let isStoppedManually = false;

        // Tiêm CSS chặn flash ảnh tĩnh
        injectCSS(`
            .eh-static-hidden { display: none !important; }
            .eh-animated-item {
                display: inline-block !important;
                outline: 3px solid #00ff88 !important;
                box-shadow: 0 0 15px rgba(0, 255, 136, 0.7) !important;
                border-radius: 4px !important;
                position: relative !important;
                margin: 4px !important;
            }
        `);

        // Tạo bảng điều khiển nổi
        const ui = createControlPanel();

        // Chạy lọc khi trang sẵn sàng
        waitForGDT(runFilter);

        function waitForGDT(callback) {
            const gdt = document.querySelector('#gdt');
            if (gdt && getThumbnailItems().length > 0) {
                callback();
                return;
            }

            // Nếu chưa load xong #gdt thì quan sát MutationObserver
            const observer = new MutationObserver(() => {
                const items = getThumbnailItems();
                if (items.length > 0) {
                    observer.disconnect();
                    callback();
                }
            });

            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });

            // Giới hạn timeout 3s
            setTimeout(() => {
                observer.disconnect();
                callback();
            }, 3000);
        }

        // Lấy tất cả thumbnail (tương thích cả layout cũ .gdtm/.gdtl lẫn layout mới #gdt > a)
        function getThumbnailItems() {
            const gdt = document.querySelector('#gdt');
            if (!gdt) return [];

            // Tìm tất cả thẻ <a> trỏ tới trang reader /s/
            const readerLinks = Array.from(gdt.querySelectorAll('a[href*="/s/"]'));
            if (readerLinks.length > 0) {
                // Nếu thẻ a nằm trong container .gdtm / .gdtl thì lấy container cha, nếu không lấy chính thẻ <a>
                const items = readerLinks.map(a => a.closest('.gdtm, .gdtl') || a);
                return Array.from(new Set(items));
            }

            // Fallback
            return Array.from(gdt.querySelectorAll('.gdtm, .gdtl'));
        }

        // Đọc tên file gốc của thumbnail
        function getItemFilename(item) {
            const elements = [item, ...item.querySelectorAll('*')];
            // Ưu tiên thuộc tính title dạng "Page X: filename.ext"
            for (const el of elements) {
                const title = el.getAttribute('title');
                if (title && title.includes('Page ')) {
                    return title.toLowerCase();
                }
            }
            // Tìm title hoặc alt bất kỳ
            for (const el of elements) {
                const title = el.getAttribute('title');
                if (title) return title.toLowerCase();
                const alt = el.getAttribute('alt');
                if (alt) return alt.toLowerCase();
            }
            return '';
        }

        // Kiểm tra xem có phải định dạng động không
        function checkIsAnimated(item) {
            const filename = getItemFilename(item);
            if (!filename) return false;

            // Bỏ qua spacer 1x1 blank.gif của e-hentai
            if (filename.includes('blank.gif') && !filename.includes('page ')) return false;

            // Kiểm tra GIF, WebM, MP4
            if (/\.(gif|webm|mp4)\b/i.test(filename)) {
                return { isAnimated: true, ext: filename.match(/\.(gif|webm|mp4)\b/i)[1].toUpperCase() };
            }

            // Kiểm tra WebP nếu bật tùy chọn
            if (includeWebp && /\.webp\b/i.test(filename)) {
                return { isAnimated: true, ext: 'WEBP' };
            }

            return { isAnimated: false, ext: '' };
        }

        function runFilter() {
            if (!isFilterActive) {
                console.log('[EH-Filter] Bộ lọc đang tắt.');
                return;
            }

            const items = getThumbnailItems();
            console.log(`[EH-Filter] Tìm thấy ${items.length} phần tử thumbnail trong #gdt.`);

            if (items.length === 0) {
                ui.setStatus('Không tìm thấy thumbnail trong #gdt.', '#ffaa00');
                return;
            }

            let animatedCount = 0;

            items.forEach((item, index) => {
                const result = checkIsAnimated(item);
                if (result.isAnimated) {
                    animatedCount++;
                    highlightAnimatedItem(item, result.ext);
                    console.log(`[EH-Filter] [✓] Ảnh động tại vị trí #${index + 1}:`, getItemFilename(item));
                } else {
                    blockAndHideStatic(item);
                }
            });

            console.log(`[EH-Filter] Kết quả: ${animatedCount} ảnh động / ${items.length} tổng số ảnh trên trang.`);

            if (animatedCount > 0) {
                // TÌM THẤY ẢNH ĐỘNG -> DỪNG LẠI
                ui.setStatus(`🎉 Tìm thấy <b>${animatedCount}</b> ảnh chuyển động!`, '#00ff88');
                ui.showNextButton(true);
            } else {
                // TOÀN ẢNH TĨNH -> CHUYỂN TRANG TIẾP THEO
                const nextUrl = getNextPageUrl();
                if (nextUrl && !isStoppedManually) {
                    ui.setStatus('⏳ Trang này toàn ảnh tĩnh. Đang chuyển trang sau 0.5s...', '#ffaa00');
                    autoNextTimer = setTimeout(() => {
                        console.log('[EH-Filter] Đang chuyển đến:', nextUrl);
                        window.location.href = nextUrl;
                    }, 500);
                } else if (!nextUrl) {
                    ui.setStatus('⚠️ Đã duyệt đến trang cuối cùng. Không tìm thấy ảnh động.', '#ff6666');
                    ui.showNextButton(false);
                }
            }
        }

        // Chặn load và ẩn ảnh tĩnh
        function blockAndHideStatic(item) {
            item.classList.add('eh-static-hidden');
            item.style.display = 'none';

            // Ngắt tải background sprite nếu có
            const bgDivs = [item, ...item.querySelectorAll('div')];
            bgDivs.forEach(div => {
                if (div.style.background && div.style.background !== 'none') {
                    div.dataset.origBg = div.style.background;
                    div.style.background = 'none';
                }
            });

            // Ngắt tải thẻ img nếu có
            const imgs = item.querySelectorAll('img');
            imgs.forEach(img => {
                if (img.src && !img.src.includes('blank.gif')) {
                    img.dataset.origSrc = img.src;
                    img.src = '';
                }
            });
        }

        // Làm nổi bật thumbnail ảnh động
        function highlightAnimatedItem(item, ext) {
            item.classList.remove('eh-static-hidden');
            item.classList.add('eh-animated-item');
            item.style.display = 'inline-block';

            if (!item.querySelector('.eh-anim-badge')) {
                const badge = document.createElement('div');
                badge.className = 'eh-anim-badge';
                badge.innerText = `🎬 ${ext}`;
                badge.style.cssText = `
                    position: absolute;
                    top: 4px;
                    left: 4px;
                    background: #00ff88;
                    color: #000;
                    font-weight: bold;
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    z-index: 99;
                    pointer-events: none;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.6);
                `;
                item.appendChild(badge);
            }
        }

        // Lấy link trang tiếp theo từ bảng phân trang table.ptt
        function getNextPageUrl() {
            const ptt = document.querySelector('table.ptt');
            if (!ptt) return null;

            const tds = ptt.querySelectorAll('td');
            if (tds.length === 0) return null;

            // Ô cuối cùng trong table.ptt là nút '>'
            const lastTd = tds[tds.length - 1];
            const nextA = lastTd.querySelector('a');

            return (nextA && nextA.href) ? nextA.href : null;
        }

        // Phục hồi lại toàn bộ ảnh tĩnh
        function restoreAllStatic() {
            if (autoNextTimer) clearTimeout(autoNextTimer);

            const items = getThumbnailItems();
            items.forEach(item => {
                item.classList.remove('eh-static-hidden', 'eh-animated-item');
                item.style.display = '';

                const bgDivs = [item, ...item.querySelectorAll('div')];
                bgDivs.forEach(div => {
                    if (div.dataset.origBg) {
                        div.style.background = div.dataset.origBg;
                    }
                });

                const imgs = item.querySelectorAll('img');
                imgs.forEach(img => {
                    if (img.dataset.origSrc) {
                        img.src = img.dataset.origSrc;
                    }
                });

                const badge = item.querySelector('.eh-anim-badge');
                if (badge) badge.remove();
            });
        }

        // Bảng điều khiển nổi (Hỗ trợ thu gọn thành icon nhỏ)
        function createControlPanel() {
            let isCollapsed = GM_getValue('eh_filter_panel_collapsed', false);

            // 1. Nút icon nhỏ để mở lại bảng điều khiển
            const miniIcon = document.createElement('button');
            miniIcon.id = 'eh-filter-mini-icon';
            miniIcon.type = 'button';
            miniIcon.title = 'Mở bảng điều khiển GIF Filter';
            miniIcon.setAttribute('aria-label', 'Mở bảng điều khiển GIF Filter');
            miniIcon.style.cssText = `
                position: fixed;
                top: 15px;
                right: 15px;
                z-index: 9999999;
                width: 38px;
                height: 38px;
                background: rgba(20, 22, 26, 0.94);
                color: #fff;
                border: 1px solid #00ff88;
                border-radius: 50%;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 18px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.6);
                display: ${isCollapsed ? 'flex' : 'none'};
                align-items: center;
                justify-content: center;
                user-select: none;
                backdrop-filter: blur(5px);
                transition: transform 0.1s, background 0.2s, box-shadow 0.2s;
            `;
            miniIcon.textContent = '🎬';
            document.body.appendChild(miniIcon);

            // 2. Bảng điều khiển chi tiết (Expanded Panel)
            const panel = document.createElement('div');
            panel.id = 'eh-filter-panel';
            panel.style.cssText = `
                position: fixed;
                top: 15px;
                right: 15px;
                z-index: 9999999;
                background: rgba(18, 18, 18, 0.95);
                color: #eee;
                padding: 12px 16px;
                border-radius: 10px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                box-shadow: 0 6px 25px rgba(0,0,0,0.7);
                border: 1px solid #444;
                display: ${isCollapsed ? 'none' : 'flex'};
                flex-direction: column;
                gap: 8px;
                min-width: 240px;
            `;

            panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px;">
                    <b style="color: #00ff88; font-size: 13px;">🎬 E-Hentai GIF Filter</b>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <label style="cursor: pointer; display: flex; align-items: center; gap: 3px; font-size: 11px;">
                            <input type="checkbox" id="eh-toggle-filter" ${isFilterActive ? 'checked' : ''}>
                            <span>Bật</span>
                        </label>
                        <button id="eh-btn-collapse" title="Thu gọn thành icon nhỏ" style="
                            background: rgba(255,255,255,0.1);
                            color: #aaa;
                            border: 1px solid #555;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 11px;
                            padding: 1px 7px;
                            line-height: 1.2;
                        ">─</button>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; font-size: 11px;">
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <input type="checkbox" id="eh-toggle-webp" ${includeWebp ? 'checked' : ''}>
                        <span>Gồm .WebP</span>
                    </label>
                </div>
                <div id="eh-status" style="color: #ccc; font-size: 11px; line-height: 1.4;">Đang kiểm tra trang...</div>
                <div style="display: flex; gap: 6px; margin-top: 4px;">
                    <button id="eh-btn-stop" style="
                        flex: 1;
                        padding: 5px 8px;
                        background: #444;
                        color: #fff;
                        border: 1px solid #666;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 11px;
                    ">Dừng chuyển</button>
                    <button id="eh-btn-next" style="
                        display: none;
                        flex: 1.5;
                        padding: 5px 8px;
                        background: #00aa55;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                        font-size: 11px;
                    ">Tìm tiếp ⏩</button>
                </div>
            `;

            document.body.appendChild(panel);

            const statusEl = panel.querySelector('#eh-status');
            const toggleFilterCb = panel.querySelector('#eh-toggle-filter');
            const toggleWebpCb = panel.querySelector('#eh-toggle-webp');
            const stopBtn = panel.querySelector('#eh-btn-stop');
            const nextBtn = panel.querySelector('#eh-btn-next');
            const collapseBtn = panel.querySelector('#eh-btn-collapse');

            // Bấm nút thu gọn ─
            collapseBtn.addEventListener('click', () => {
                isCollapsed = true;
                GM_setValue('eh_filter_panel_collapsed', true);
                panel.style.display = 'none';
                miniIcon.style.display = 'flex';
            });

            // Bấm vào icon nhỏ để mở lại bảng điều khiển
            miniIcon.addEventListener('click', () => {
                isCollapsed = false;
                GM_setValue('eh_filter_panel_collapsed', false);
                panel.style.display = 'flex';
                miniIcon.style.display = 'none';
            });

            toggleFilterCb.addEventListener('change', (e) => {
                isFilterActive = e.target.checked;
                GM_setValue('eh_g_filter_active', isFilterActive);
                if (isFilterActive) {
                    runFilter();
                } else {
                    statusEl.innerText = 'Đã tắt bộ lọc (Đã khôi phục ảnh tĩnh)';
                    statusEl.style.color = '#ccc';
                    miniIcon.title = 'Bộ lọc đã tắt — bấm để mở bảng điều khiển';
                    nextBtn.style.display = 'none';
                    restoreAllStatic();
                }
            });

            toggleWebpCb.addEventListener('change', (e) => {
                includeWebp = e.target.checked;
                GM_setValue('eh_include_webp', includeWebp);
                if (isFilterActive) {
                    restoreAllStatic();
                    runFilter();
                }
            });

            stopBtn.addEventListener('click', () => {
                isStoppedManually = true;
                if (autoNextTimer) {
                    clearTimeout(autoNextTimer);
                    autoNextTimer = null;
                }
                statusEl.innerText = 'Đã tạm dừng tự động chuyển trang.';
                statusEl.style.color = '#ffaa00';
                miniIcon.title = 'Đã tạm dừng tự động chuyển trang — bấm để mở bảng điều khiển';
            });

            nextBtn.addEventListener('click', () => {
                const nextUrl = getNextPageUrl();
                if (nextUrl) {
                    statusEl.innerText = 'Đang chuyển sang trang sau...';
                    miniIcon.title = 'Đang chuyển trang...';
                    window.location.href = nextUrl;
                }
            });

            return {
                setStatus: (msg, color = '#ccc') => {
                    statusEl.innerHTML = msg;
                    statusEl.style.color = color;

                    // Hiển thị trạng thái trong tooltip của nút icon thu nhỏ
                    if (msg.includes('Tìm thấy')) {
                        const countMatch = msg.match(/<b>(\d+)<\/b>/);
                        miniIcon.title = countMatch
                            ? `Tìm thấy ${countMatch[1]} ảnh động — bấm để mở bảng điều khiển`
                            : 'Đã tìm thấy ảnh động — bấm để mở bảng điều khiển';
                    } else if (msg.includes('Đang chuyển')) {
                        miniIcon.title = 'Đang quét và chuyển trang — bấm để mở bảng điều khiển';
                    } else if (msg.includes('trang cuối')) {
                        miniIcon.title = 'Đã đến trang cuối — bấm để mở bảng điều khiển';
                    } else {
                        miniIcon.title = `GIF Filter — bấm để mở bảng điều khiển`;
                    }
                },
                showNextButton: (show) => {
                    nextBtn.style.display = (show && getNextPageUrl()) ? 'block' : 'none';
                }
            };
        }
    }

    /* =========================================================================
       CHỨC NĂNG BỎ QUA ẢNH TĨNH TẠI TRANG ĐỌC /s/
       ========================================================================= */
    function initReaderAutoSkip() {
        console.log('[EH-Filter] Đang kích hoạt Auto-skip cho trang reader /s/...');
        let autoSkipEnabled = GM_getValue('eh_only_animated', true);
        if (!autoSkipEnabled) return;

        function checkIsAnimated() {
            const infoDiv = document.querySelector('#i2 div');
            if (infoDiv) {
                const text = infoDiv.innerText.toLowerCase();
                if (text.includes('.gif') || text.includes('.webm') || text.includes('.mp4')) return true;
                if (text.includes('.webp')) return true;
            }
            const img = document.querySelector('#img');
            if (img && img.src) {
                const src = img.src.toLowerCase();
                if (src.includes('.gif') || src.includes('.webm') || src.includes('.mp4')) return true;
                if (src.includes('.webp')) return true;
            }
            return false;
        }

        function checkAndSkip() {
            if (!autoSkipEnabled) return;
            if (!checkIsAnimated()) {
                const nextBtn = document.querySelector('#next');
                if (nextBtn && nextBtn.href && nextBtn.href !== window.location.href) {
                    console.log('[EH-Filter] Phát hiện ảnh tĩnh, tự động Next trang...');
                    setTimeout(() => {
                        nextBtn.click();
                    }, 250);
                }
            } else {
                console.log('[EH-Filter] Đã dừng tại ảnh động!');
            }
        }

        const mainImg = document.querySelector('#img');
        if (mainImg) {
            if (mainImg.complete) {
                checkAndSkip();
            } else {
                mainImg.addEventListener('load', checkAndSkip);
            }
        } else {
            checkAndSkip();
        }
    }

    function injectCSS(css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }
})();
