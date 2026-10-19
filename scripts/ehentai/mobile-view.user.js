// ==UserScript==
// @name         E-Hentai Mobile View (Home, /g/, /s/)
// @namespace    http://tampermonkey.net/
// @version      2.11
// @description  Tối ưu giao diện mobile cho trang chủ, gallery /g/ và reader /s/ trên E-Hentai
// @author       XNhanhS & AI
// @match        *://e-hentai.org/g/*
// @match        *://exhentai.org/g/*
// @match        *://e-hentai.org/s/*
// @match        *://exhentai.org/s/*
// @match        *://e-hentai.org/
// @match        *://exhentai.org/
// @icon         https://e-hentai.org/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // 1. Tiêm Meta Viewport chuẩn cho thiết bị di động
    ensureViewportMeta();

    // 2. Trạng thái bật/tắt (Mặc định BẬT khi màn hình <= 850px hoặc người dùng đã lưu)
    const path = window.location.pathname;
    const isHomepage = path === '/';
    const isSmallScreen = window.innerWidth <= 850;
    let isMobileMode = GM_getValue('eh_mobile_restructure_active', isSmallScreen);
    let readerControlsObserver = null;
    let readerToolbarResizeObserver = null;
    let readerToolbarResizeTarget = null;

    // Tiêm CSS ngay từ đầu
    injectStyles();

    // Chờ DOM sẵn sàng để trích xuất dữ liệu và dựng giao diện Mobile
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileApp);
    } else {
        initMobileApp();
    }

    function ensureViewportMeta() {
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
            (document.head || document.documentElement).appendChild(meta);
        } else {
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
        }
    }

    function initMobileApp() {
        createDesktopFloatingSwitch();

        if (path.startsWith('/s/')) {
            if (isMobileMode) applyReaderMobileMode();
            return;
        }

        if (isHomepage) {
            if (isMobileMode) applyHomeMobileMode();
            return;
        }

        if (isMobileMode) {
            buildAndMountMobileApp();
        }
    }

    // Giữ DOM và hành vi tìm kiếm/phân trang gốc, chỉ đổi cách xếp trang chủ trên mobile.
    function applyHomeMobileMode() {
        document.documentElement.classList.add('eh-home-mobile-active');
        const searchField = document.querySelector('#f_search');
        if (searchField && searchField.parentElement) {
            searchField.parentElement.classList.add('eh-home-search-row');
        }
        const displayMode = document.querySelector('.searchnav select');
        if (displayMode) {
            document.documentElement.dataset.ehHomeDisplayMode = displayMode.value;
        }
        syncHomeDesktopSwitch();
    }

    // Tối ưu bố cục reader mà vẫn dùng nguyên ảnh và điều hướng của trang.
    function applyReaderMobileMode() {
        const root = document.documentElement;
        root.classList.add('eh-reader-mobile-active');
        if (!root.classList.contains('eh-reader-fit-width') &&
            !root.classList.contains('eh-reader-fit-screen') &&
            !root.classList.contains('eh-reader-natural-size')) {
            root.classList.add('eh-reader-fit-width');
        }
        setupReaderViewControls();
    }

    function setupReaderViewControls() {
        const image = document.querySelector('#img');
        if (image && !image.dataset.ehMobileClickDisabled) {
            image.dataset.ehMobileClickDisabled = 'true';
            image.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
        }

        const sourceNav = document.querySelector('#i2 .sn');
        let nav = document.querySelector('#eh-reader-control-bar');
        if (sourceNav && (!nav || nav.dataset.sourceSignature !== sourceNav.innerHTML)) {
            const oldSwitch = document.querySelector('#eh-to-mobile-switch');
            if (oldSwitch) document.body.appendChild(oldSwitch);

            const replacement = sourceNav.cloneNode(true);
            replacement.id = 'eh-reader-control-bar';
            replacement.dataset.sourceSignature = sourceNav.innerHTML;
            replacement.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
            if (nav) nav.replaceWith(replacement);
            else document.body.appendChild(replacement);
            nav = replacement;
        }

        if (nav && !nav.querySelector('#eh-reader-view-mode')) {
            const button = document.createElement('button');
            button.id = 'eh-reader-view-mode';
            button.type = 'button';
            button.style.cssText = `
                min-height: 38px;
                padding: 0 10px;
                border: 1px solid #00aa55;
                border-radius: 9px;
                background: #17452f;
                color: #fff;
                font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                white-space: nowrap;
                cursor: pointer;
            `;
            button.addEventListener('click', () => {
                const root = document.documentElement;
                const mode = root.classList.contains('eh-reader-fit-width')
                    ? 'eh-reader-fit-screen'
                    : root.classList.contains('eh-reader-fit-screen')
                        ? 'eh-reader-natural-size'
                        : 'eh-reader-fit-width';
                root.classList.remove('eh-reader-fit-width', 'eh-reader-fit-screen', 'eh-reader-natural-size');
                root.classList.add(mode);
                updateReaderViewButton();
            });
            nav.appendChild(button);
        }

        if (nav) {
            syncReaderDesktopSwitch(nav);
            syncReaderToolbarSpacing(nav);
        }
        updateReaderViewButton();
        if (!readerControlsObserver && document.querySelector('#i1')) {
            readerControlsObserver = new MutationObserver(setupReaderViewControls);
            readerControlsObserver.observe(document.querySelector('#i1'), { childList: true, subtree: true });
        }
    }

    function syncReaderToolbarSpacing(nav) {
        const updateHeight = () => {
            const height = Math.ceil(nav.getBoundingClientRect().height);
            if (height > 0) {
                document.documentElement.style.setProperty('--eh-reader-toolbar-height', `${height}px`);
            }
        };

        updateHeight();
        if (!readerToolbarResizeObserver || readerToolbarResizeTarget !== nav) {
            if (readerToolbarResizeObserver) readerToolbarResizeObserver.disconnect();
            readerToolbarResizeObserver = new ResizeObserver(updateHeight);
            readerToolbarResizeObserver.observe(nav);
            readerToolbarResizeTarget = nav;
        }
    }

    function syncReaderDesktopSwitch(nav) {
        const button = document.querySelector('#eh-to-mobile-switch');
        if (!button) return;

        if (isMobileMode) {
            button.textContent = '💻';
            button.title = 'Chuyển về giao diện desktop';
            button.setAttribute('aria-label', button.title);
            button.style.cssText = `
                position: static;
                z-index: 2147483647;
                display: flex;
                flex: 0 0 38px;
                align-items: center;
                justify-content: center;
                width: 38px;
                min-width: 38px;
                height: 38px;
                padding: 0;
                border: 1px solid #00ff88;
                border-radius: 9px;
                background: #00aa55;
                color: #fff;
                font-size: 18px;
                cursor: pointer;
            `;
            if (button.parentElement !== nav) nav.appendChild(button);
            return;
        }

        button.textContent = '📱 Chế độ Mobile';
        button.title = 'Bật giao diện mobile';
        button.setAttribute('aria-label', button.title);
        button.style.cssText = `
            position: fixed;
            bottom: 15px;
            right: 15px;
            z-index: 9999999;
            display: block;
            padding: 8px 16px;
            border: 2px solid #00ff88;
            border-radius: 50px;
            background: #00aa55;
            color: #fff;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        `;
        if (button.parentElement !== document.body) document.body.appendChild(button);
    }

    function updateReaderViewButton() {
        const button = document.querySelector('#eh-reader-control-bar #eh-reader-view-mode');
        if (!button) return;

        const root = document.documentElement;
        let label;
        let title;
        if (root.classList.contains('eh-reader-fit-screen')) {
            label = '1:1 Ảnh gốc';
            title = 'Xem ảnh ở kích thước gốc';
        } else if (root.classList.contains('eh-reader-natural-size')) {
            label = '↔ Vừa chiều rộng';
            title = 'Thu ảnh vừa chiều rộng màn hình';
        } else {
            label = '⤢ Vừa màn hình';
            title = 'Thu toàn bộ ảnh vừa màn hình';
        }
        if (button.textContent !== label) button.textContent = label;
        if (button.title !== title) {
            button.title = title;
            button.setAttribute('aria-label', title);
        }
    }

    // Xây dựng toàn bộ giao diện Mobile mới
    function buildAndMountMobileApp() {
        let app = document.querySelector('#eh-mobile-app');
        if (app) {
            app.style.display = 'block';
            document.documentElement.classList.add('eh-mobile-active');
            return;
        }

        const data = extractGalleryData();
        if (!data.titleEn && !data.coverUrl) {
            console.warn('[EH-Mobile] Chưa tìm thấy dữ liệu gallery, thử lại sau 300ms...');
            setTimeout(buildAndMountMobileApp, 300);
            return;
        }

        // Kích hoạt class ẩn toàn bộ desktop DOM cũ
        document.documentElement.classList.add('eh-mobile-active');

        // Tạo container ứng dụng Mobile mới
        app = document.createElement('div');
        app.id = 'eh-mobile-app';

        app.appendChild(renderHeader(data));
        app.appendChild(renderHeroCard(data));
        app.appendChild(renderActionButtons(data));
        app.appendChild(renderMetadataCard(data));
        app.appendChild(renderTagsCard(data));
        app.appendChild(renderThumbnailsSection(data));
        app.appendChild(renderPagination(data));

        document.body.appendChild(app);
        console.log('[EH-Mobile] Đã tái cấu trúc hoàn tất giao diện Mobile!');
    }

    // Trích xuất toàn bộ dữ liệu từ HTML gốc
    function extractGalleryData() {
        // Tiêu đề
        const gn = document.querySelector('#gn');
        const gj = document.querySelector('#gj');
        const titleEn = gn ? gn.innerText.trim() : '';
        const titleJp = gj ? gj.innerText.trim() : '';

        // Ảnh bìa
        let coverUrl = '';
        const gd1Div = document.querySelector('#gd1 > div');
        if (gd1Div && gd1Div.style.backgroundImage) {
            const m = gd1Div.style.backgroundImage.match(/url\(["']?([^"']+)["']?\)/);
            if (m) coverUrl = m[1];
        } else {
            const gd1Img = document.querySelector('#gd1 img');
            if (gd1Img) coverUrl = gd1Img.src;
        }

        // Thể loại (Category)
        const gdc = document.querySelector('#gdc .cs');
        const categoryName = gdc ? gdc.innerText.trim() : 'Gallery';
        const categoryClass = gdc ? gdc.className : 'cs';

        // Uploader
        const gdn = document.querySelector('#gdn a');
        const uploaderName = gdn ? gdn.innerText.trim() : '';
        const uploaderUrl = gdn ? gdn.href : '';

        // Rating
        const ratingLbl = document.querySelector('#rating_label');
        const ratingCnt = document.querySelector('#rating_count');
        const ratingText = ratingLbl ? ratingLbl.innerText.trim() : '';
        const ratingCount = ratingCnt ? ratingCnt.innerText.trim() : '0';

        // Thông số chi tiết (#gdd)
        const metaPairs = [];
        const rows = document.querySelectorAll('#gdd tr');
        rows.forEach(tr => {
            const k = tr.querySelector('.gdt1');
            const v = tr.querySelector('.gdt2');
            if (k && v) {
                metaPairs.push({
                    key: k.innerText.replace(':', '').trim(),
                    value: v.innerText.trim()
                });
            }
        });

        // Danh sách Tags (#taglist)
        const tagGroups = [];
        const tagRows = document.querySelectorAll('#taglist tr');
        tagRows.forEach(tr => {
            const cat = tr.querySelector('td.tc');
            const tagEls = tr.querySelectorAll('td:nth-child(2) a');
            if (cat && tagEls.length > 0) {
                const group = {
                    category: cat.innerText.replace(':', '').trim(),
                    tags: []
                };
                tagEls.forEach(a => {
                    group.tags.push({
                        name: a.innerText.trim(),
                        url: a.href
                    });
                });
                tagGroups.push(group);
            }
        });

        // Danh sách Thumbnails (#gdt)
        const thumbnails = [];
        const gdtLinks = Array.from(document.querySelectorAll('#gdt a[href*="/s/"]'));
        gdtLinks.forEach((a, idx) => {
            const thumbDiv = a.querySelector('div') || a.querySelector('img');
            const title = (thumbDiv?.getAttribute('title') || a.getAttribute('title') || '').toLowerCase();
            const pageNumMatch = title.match(/page\s+(\d+)/i);
            const pageNum = pageNumMatch ? pageNumMatch[1] : (idx + 1);

            // Đo kích thước gốc để tính tỉ lệ co dãn vừa khít
            const origW = parseInt(thumbDiv?.style.width) || parseInt(thumbDiv?.getAttribute('width')) || 200;
            const origH = parseInt(thumbDiv?.style.height) || parseInt(thumbDiv?.getAttribute('height')) || 267;

            // Kiểm tra ảnh động
            const isAnimated = /\.(gif|webm|mp4|webp)\b/i.test(title);
            let ext = '';
            if (isAnimated) {
                const extM = title.match(/\.(gif|webm|mp4|webp)\b/i);
                ext = extM ? extM[1].toUpperCase() : 'GIF';
            }

            thumbnails.push({
                href: a.href,
                element: thumbDiv ? thumbDiv.cloneNode(true) : null,
                width: origW,
                height: origH,
                pageNum: pageNum,
                isAnimated: isAnimated,
                ext: ext,
                title: title
            });
        });

        // Phân trang (table.ptt)
        const pagination = {
            prevUrl: null,
            nextUrl: null,
            currentPage: '1',
            totalPages: '1',
            pages: []
        };
        const ptt = document.querySelector('table.ptt');
        if (ptt) {
            const tds = Array.from(ptt.querySelectorAll('td'));
            tds.forEach((td, i) => {
                const a = td.querySelector('a');
                const text = td.innerText.trim();
                const isCurrent = td.classList.contains('ptds');

                if (i === 0 && a) pagination.prevUrl = a.href;
                if (i === tds.length - 1 && a) pagination.nextUrl = a.href;

                if (isCurrent) pagination.currentPage = text;

                if (a && text !== '<' && text !== '>') {
                    pagination.pages.push({ text: text, href: a.href, isCurrent: isCurrent });
                } else if (isCurrent) {
                    pagination.pages.push({ text: text, href: null, isCurrent: true });
                }
            });

            const numPages = pagination.pages.filter(p => !isNaN(parseInt(p.text)));
            if (numPages.length > 0) {
                pagination.totalPages = numPages[numPages.length - 1].text;
            }
        }

        return {
            titleEn,
            titleJp,
            coverUrl,
            categoryName,
            categoryClass,
            uploaderName,
            uploaderUrl,
            ratingText,
            ratingCount,
            metaPairs,
            tagGroups,
            thumbnails,
            pagination
        };
    }

    /* =========================================================================
       UI COMPONENTS
       ========================================================================= */

    // 1. Header Bar
    function renderHeader(data) {
        const header = document.createElement('div');
        header.className = 'eh-m-header';
        header.innerHTML = `
            <div class="eh-m-logo">E-Hentai Mobile</div>
            <button class="eh-m-desktop-btn">💻 Xem Desktop</button>
        `;

        header.querySelector('.eh-m-desktop-btn').addEventListener('click', () => {
            isMobileMode = false;
            GM_setValue('eh_mobile_restructure_active', false);
            document.documentElement.classList.remove('eh-mobile-active');
            const app = document.querySelector('#eh-mobile-app');
            if (app) app.style.display = 'none';
            const switchBtn = document.querySelector('#eh-to-mobile-switch');
            if (switchBtn) switchBtn.style.display = 'block';
        });

        return header;
    }

    // 2. Hero Card
    function renderHeroCard(data) {
        const card = document.createElement('div');
        card.className = 'eh-m-hero-card';

        let coverHtml = '';
        if (data.coverUrl) {
            coverHtml = `<img src="${data.coverUrl}" class="eh-m-cover-img" alt="Cover" />`;
        }

        let uploaderHtml = '';
        if (data.uploaderName) {
            uploaderHtml = `
                <div class="eh-m-uploader">
                    Đăng bởi: <a href="${data.uploaderUrl}">${data.uploaderName}</a>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="eh-m-cover-wrap">
                ${coverHtml}
            </div>
            <div class="eh-m-badge-row">
                <span class="eh-m-cat ${data.categoryClass}">${data.categoryName}</span>
                <span class="eh-m-rating">⭐ ${data.ratingText || 'Chưa đánh giá'} (${data.ratingCount})</span>
            </div>
            <h1 class="eh-m-title-en">${data.titleEn}</h1>
            ${data.titleJp ? `<div class="eh-m-title-jp">${data.titleJp}</div>` : ''}
            ${uploaderHtml}
        `;

        return card;
    }

    // 3. Nút Thao tác
    function renderActionButtons(data) {
        const bar = document.createElement('div');
        bar.className = 'eh-m-action-bar';

        bar.innerHTML = `
            <button class="eh-m-btn eh-m-btn-fav">⭐ Yêu thích</button>
            <button class="eh-m-btn eh-m-btn-arch">📥 Tải Archive</button>
            <button class="eh-m-btn eh-m-btn-torr">⚡ Torrent</button>
        `;

        bar.querySelector('.eh-m-btn-fav').addEventListener('click', () => {
            const favEl = document.querySelector('#gdf, #favoritelink');
            if (favEl) {
                favEl.click();
            } else if (typeof window.pop_fav === 'function') {
                window.pop_fav();
            }
        });

        bar.querySelector('.eh-m-btn-arch').addEventListener('click', () => {
            const arch = document.querySelector('a[onclick*="archiver"]');
            if (arch) arch.click();
            else alert('Chức năng tải Archive cần quyền tài khoản.');
        });

        bar.querySelector('.eh-m-btn-torr').addEventListener('click', () => {
            const torr = document.querySelector('a[onclick*="gallerytorrents"]');
            if (torr) torr.click();
            else alert('Không có torrent cho bộ này.');
        });

        return bar;
    }

    // 4. Thẻ Thông tin chi tiết
    function renderMetadataCard(data) {
        const card = document.createElement('div');
        card.className = 'eh-m-section-card';
        card.innerHTML = `<h3 class="eh-m-section-title">📊 Chi tiết bộ truyện</h3>`;

        const grid = document.createElement('div');
        grid.className = 'eh-m-meta-grid';

        data.metaPairs.forEach(pair => {
            const item = document.createElement('div');
            item.className = 'eh-m-meta-item';
            item.innerHTML = `
                <span class="eh-m-meta-key">${pair.key}</span>
                <span class="eh-m-meta-val">${pair.value}</span>
            `;
            grid.appendChild(item);
        });

        card.appendChild(grid);
        return card;
    }

    // 5. Thẻ Danh sách Tags
    function renderTagsCard(data) {
        const card = document.createElement('div');
        card.className = 'eh-m-section-card';
        card.innerHTML = `<h3 class="eh-m-section-title">🏷️ Phân loại Tags</h3>`;

        if (data.tagGroups.length === 0) {
            card.innerHTML += `<div style="font-size: 12px; color: #888;">Không có tag</div>`;
            return card;
        }

        const container = document.createElement('div');
        container.className = 'eh-m-tags-container';

        data.tagGroups.forEach(grp => {
            const row = document.createElement('div');
            row.className = 'eh-m-tag-group';

            const catLabel = document.createElement('div');
            catLabel.className = 'eh-m-tag-cat';
            catLabel.innerText = grp.category;

            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'eh-m-tag-chips';

            grp.tags.forEach(t => {
                const chip = document.createElement('a');
                chip.className = 'eh-m-tag-chip';
                chip.href = t.url;
                chip.innerText = t.name;
                tagsDiv.appendChild(chip);
            });

            row.appendChild(catLabel);
            row.appendChild(tagsDiv);
            container.appendChild(row);
        });

        card.appendChild(container);
        return card;
    }

    // 6. Lưới Thumbnails Ảnh (Tối ưu co dãn trọn vẹn khung hình)
    function renderThumbnailsSection(data) {
        const section = document.createElement('div');
        section.id = 'eh-m-thumbs-section';
        section.className = 'eh-m-section-card';

        section.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3 class="eh-m-section-title" style="margin: 0;">📸 Danh sách ảnh (${data.thumbnails.length} ảnh)</h3>
            </div>
        `;

        const grid = document.createElement('div');
        grid.className = 'eh-m-thumbs-grid';

        data.thumbnails.forEach(t => {
            const card = document.createElement('a');
            card.className = 'eh-m-thumb-card';
            card.href = t.href;

            const preview = document.createElement('div');
            preview.className = 'eh-m-thumb-preview';

            if (t.element) {
                // Tính toán hệ số zoom chính xác theo chiều rộng của ô (115px)
                // Đảm bảo ảnh dù là ảnh dọc hay ảnh ngang đều co dãn trọn vẹn, không bao giờ bị cắt
                const targetWidth = 115;
                const zoomFactor = t.width > 0 ? (targetWidth / t.width).toFixed(3) : 0.58;

                t.element.style.zoom = zoomFactor;
                t.element.style.margin = '0 auto';
                t.element.style.display = 'block';

                preview.appendChild(t.element);
            }

            const footer = document.createElement('div');
            footer.className = 'eh-m-thumb-footer';
            footer.innerHTML = `
                <span>Trang ${t.pageNum}</span>
                ${t.isAnimated ? `<span class="eh-m-anim-badge">🎬 ${t.ext}</span>` : ''}
            `;

            card.appendChild(preview);
            card.appendChild(footer);
            grid.appendChild(card);
        });

        section.appendChild(grid);
        return section;
    }

    // 7. Bảng Phân trang
    function renderPagination(data) {
        const bar = document.createElement('div');
        bar.className = 'eh-m-pagination-bar';

        const prevBtn = document.createElement('a');
        prevBtn.className = `eh-m-page-nav ${!data.pagination.prevUrl ? 'disabled' : ''}`;
        prevBtn.innerText = '◀ Trang trước';
        if (data.pagination.prevUrl) prevBtn.href = data.pagination.prevUrl;

        const info = document.createElement('div');
        info.className = 'eh-m-page-info';
        info.innerText = `Trang ${data.pagination.currentPage} / ${data.pagination.totalPages}`;

        const nextBtn = document.createElement('a');
        nextBtn.className = `eh-m-page-nav ${!data.pagination.nextUrl ? 'disabled' : ''}`;
        nextBtn.innerText = 'Trang sau ▶';
        if (data.pagination.nextUrl) nextBtn.href = data.pagination.nextUrl;

        bar.appendChild(prevBtn);
        bar.appendChild(info);
        bar.appendChild(nextBtn);

        return bar;
    }

    // Nút nổi ở chế độ Desktop để chuyển lại sang Mobile
    function createDesktopFloatingSwitch() {
        if (document.querySelector('#eh-to-mobile-switch')) return;

        const btn = document.createElement('button');
        btn.id = 'eh-to-mobile-switch';
        const isReaderPage = path.startsWith('/s/');
        btn.innerText = (isReaderPage || isHomepage) && isMobileMode ? '💻 Xem Desktop' : '📱 Chế độ Mobile';
        btn.style.cssText = `
            position: fixed;
            bottom: 15px;
            right: 15px;
            z-index: 9999999;
            background: #00aa55;
            color: #fff;
            border: 2px solid #00ff88;
            border-radius: 50px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            display: ${isMobileMode && !isReaderPage ? 'none' : 'block'};
        `;

        btn.addEventListener('click', () => {
            if (isHomepage && isMobileMode) {
                isMobileMode = false;
                GM_setValue('eh_mobile_restructure_active', false);
                document.documentElement.classList.remove('eh-home-mobile-active');
                delete document.documentElement.dataset.ehHomeDisplayMode;
                syncHomeDesktopSwitch();
                return;
            }

            if (isReaderPage && isMobileMode) {
                isMobileMode = false;
                GM_setValue('eh_mobile_restructure_active', false);
                document.documentElement.classList.remove('eh-reader-mobile-active');
                syncReaderDesktopSwitch(document.querySelector('#eh-reader-control-bar'));
                return;
            }

            isMobileMode = true;
            GM_setValue('eh_mobile_restructure_active', true);
            if (isReaderPage) {
                applyReaderMobileMode();
            } else if (isHomepage) {
                applyHomeMobileMode();
            } else {
                btn.style.display = 'none';
                buildAndMountMobileApp();
            }
        });

        document.body.appendChild(btn);
    }

    function syncHomeDesktopSwitch() {
        const button = document.querySelector('#eh-to-mobile-switch');
        if (!button) return;

        if (isMobileMode) {
            button.textContent = '💻 Desktop';
            button.title = 'Chuyển về giao diện desktop';
            button.setAttribute('aria-label', button.title);
            button.style.cssText = `
                position: static;
                z-index: 2147483647;
                display: block;
                flex: 0 0 auto;
                margin: 0 6px;
                padding: 6px 9px;
                border: 1px solid #00ff88;
                border-radius: 9px;
                background: #00aa55;
                color: #fff;
                font-size: 12px;
                font-weight: 700;
                white-space: nowrap;
                cursor: pointer;
            `;
            const nav = document.querySelector('#nb');
            if (nav && button.parentElement !== nav) nav.appendChild(button);
            return;
        }

        button.textContent = '📱 Chế độ Mobile';
        button.title = 'Bật giao diện mobile';
        button.setAttribute('aria-label', button.title);
        button.style.cssText = `
            position: fixed;
            bottom: 15px;
            right: 15px;
            z-index: 9999999;
            display: block;
            padding: 8px 16px;
            border: 2px solid #00ff88;
            border-radius: 50px;
            background: #00aa55;
            color: #fff;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        `;
        if (button.parentElement !== document.body) document.body.appendChild(button);
    }

    /* =========================================================================
       CSS TÁI CẤU TRÚC HOÀN TOÀN
       ========================================================================= */
    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'eh-mobile-app-styles';
        style.textContent = `
            /* KHI BẬT CHẾ ĐỘ MOBILE: ẨN TOÀN BỘ DESKTOP DOM CŨ */
            html.eh-mobile-active body > *:not(#eh-mobile-app):not(#eh-to-mobile-switch):not(#eh-filter-panel):not(#eh-filter-mini-icon) {
                display: none !important;
            }
            html.eh-mobile-active #eh-filter-panel,
            html.eh-mobile-active #eh-filter-mini-icon {
                z-index: 2147483646 !important;
            }

            html.eh-mobile-active,
            html.eh-mobile-active body {
                width: 100% !important;
                max-width: 100vw !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #141518 !important;
                color: #e5e7eb !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                overflow-x: hidden !important;
                box-sizing: border-box !important;
            }

            /* HOMEPAGE /: reflow DOM gốc để giữ nguyên tìm kiếm và điều hướng của E-Hentai */
            html.eh-home-mobile-active,
            html.eh-home-mobile-active body {
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100vw !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow-x: hidden !important;
                background: #141518 !important;
                color: #e5e7eb !important;
                box-sizing: border-box !important;
            }
            html.eh-home-mobile-active body > iframe {
                display: none !important;
            }
            html.eh-home-mobile-active #nb {
                position: sticky !important;
                top: 0 !important;
                z-index: 1000 !important;
                display: flex !important;
                align-items: center !important;
                gap: 4px !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100vw !important;
                margin: 0 !important;
                padding: 6px 8px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                white-space: nowrap !important;
                background: #202228 !important;
                border-bottom: 1px solid #343741 !important;
                scrollbar-width: none !important;
            }
            html.eh-home-mobile-active #nb::-webkit-scrollbar {
                display: none !important;
            }
            html.eh-home-mobile-active #nb > div {
                flex: 0 0 auto !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            html.eh-home-mobile-active #nb a {
                display: block !important;
                padding: 6px 8px !important;
                border-radius: 7px !important;
                color: #e5e7eb !important;
                font-size: 12px !important;
                text-decoration: none !important;
            }
            html.eh-home-mobile-active #nb > #eh-to-mobile-switch {
                flex: 0 0 auto !important;
            }
            html.eh-home-mobile-active .ido {
                display: block !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100vw !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 8px 0 20px !important;
                overflow: hidden !important;
                background: #141518 !important;
                color: #e5e7eb !important;
            }
            html.eh-home-mobile-active .ido > * {
                box-sizing: border-box !important;
                max-width: 100% !important;
            }
            html.eh-home-mobile-active #toppane {
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 8px !important;
                background: transparent !important;
            }
            html.eh-home-mobile-active #toppane h1.ih {
                margin: 0 0 8px !important;
                color: #e5e7eb !important;
                font-size: 13px !important;
                line-height: 1.35 !important;
                text-align: center !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active #searchbox,
            html.eh-home-mobile-active #fsdiv {
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 8px !important;
                border: 1px solid #343741 !important;
                border-radius: 12px !important;
                background: #1e2025 !important;
                color: #e5e7eb !important;
            }
            html.eh-home-mobile-active #searchbox table.itc,
            html.eh-home-mobile-active #searchbox table.itc tbody {
                display: block !important;
                width: 100% !important;
                margin: 0 0 8px !important;
            }
            html.eh-home-mobile-active #searchbox table.itc tr {
                display: grid !important;
                grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
                gap: 4px !important;
                width: 100% !important;
                margin: 0 0 4px !important;
            }
            html.eh-home-mobile-active #searchbox table.itc td {
                display: block !important;
                min-width: 0 !important;
                padding: 0 !important;
            }
            html.eh-home-mobile-active #searchbox table.itc .cs {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                width: 100% !important;
                min-height: 34px !important;
                padding: 4px 2px !important;
                border-radius: 7px !important;
                font-size: 10px !important;
                line-height: 1.1 !important;
                text-align: center !important;
                white-space: normal !important;
            }
            html.eh-home-mobile-active #searchbox form > div.eh-home-search-row {
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) auto auto !important;
                gap: 5px !important;
                width: 100% !important;
                margin: 0 0 8px !important;
            }
            html.eh-home-mobile-active #f_search {
                box-sizing: border-box !important;
                width: 100% !important;
                min-width: 0 !important;
                height: 38px !important;
                padding: 0 9px !important;
                border: 1px solid #454955 !important;
                border-radius: 8px !important;
                background: #141518 !important;
                color: #fff !important;
                font-size: 14px !important;
            }
            html.eh-home-mobile-active #searchbox input[type="submit"],
            html.eh-home-mobile-active #searchbox input[type="button"] {
                min-height: 38px !important;
                padding: 0 9px !important;
                border: 1px solid #454955 !important;
                border-radius: 8px !important;
                background: #2b2e37 !important;
                color: #fff !important;
                font-size: 12px !important;
            }
            html.eh-home-mobile-active #searchbox form > div:nth-of-type(2) {
                display: flex !important;
                flex-wrap: wrap !important;
                justify-content: center !important;
                gap: 4px !important;
                font-size: 12px !important;
            }
            html.eh-home-mobile-active #searchbox a {
                color: #8bd5ff !important;
            }
            html.eh-home-mobile-active #advdiv,
            html.eh-home-mobile-active #fsdiv {
                max-width: 100% !important;
                overflow-x: auto !important;
            }
            html.eh-home-mobile-active #rangebar {
                display: flex !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100vw !important;
                gap: 4px !important;
                padding: 5px 8px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                white-space: nowrap !important;
                scrollbar-width: thin !important;
            }
            html.eh-home-mobile-active #rangebar a {
                flex: 0 0 auto !important;
            }
            html.eh-home-mobile-active .searchtext {
                padding: 6px 8px !important;
                color: #c3c7d0 !important;
                font-size: 12px !important;
                text-align: center !important;
            }
            html.eh-home-mobile-active .searchnav {
                display: flex !important;
                flex-wrap: wrap !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 2px !important;
                width: 100% !important;
                max-width: 100% !important;
                padding: 5px 8px !important;
                background: transparent !important;
            }
            html.eh-home-mobile-active .searchnav > div {
                box-sizing: border-box !important;
                flex: 0 1 auto !important;
                min-width: 0 !important;
                padding: 1px 2px !important;
                color: #c3c7d0 !important;
                font-size: 10px !important;
            }
            html.eh-home-mobile-active .searchnav a {
                color: #e5e7eb !important;
                white-space: nowrap !important;
            }
            html.eh-home-mobile-active .searchnav select {
                box-sizing: border-box !important;
                width: auto !important;
                max-width: 104px !important;
                min-width: 0 !important;
                min-height: 30px !important;
                padding: 3px 18px 3px 6px !important;
                border: 1px solid #454955 !important;
                border-radius: 7px !important;
                background: #202228 !important;
                color: #fff !important;
                font-size: 10px !important;
            }
            html.eh-home-mobile-active table.itg {
                display: block !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                border: 0 !important;
                border-spacing: 0 !important;
                overflow: visible !important;
            }
            html.eh-home-mobile-active table.itg > tbody {
                display: block !important;
                width: 100% !important;
            }
            html.eh-home-mobile-active table.itg:not(.glte) > tbody > tr:first-child {
                display: none !important;
            }
            html.eh-home-mobile-active table.itg:not(.glte) > tbody > tr:not(:first-child) {
                display: grid !important;
                grid-template-columns: 78px minmax(0, 1fr) !important;
                grid-template-areas: "category title" "meta title" "uploader uploader" !important;
                align-items: start !important;
                box-sizing: border-box !important;
                width: calc(100% - 16px) !important;
                max-width: calc(100% - 16px) !important;
                min-width: 0 !important;
                margin: 0 8px 8px !important;
                padding: 8px !important;
                border: 1px solid #343741 !important;
                border-radius: 10px !important;
                background: #1e2025 !important;
                box-shadow: 0 2px 8px rgba(0,0,0,.2) !important;
            }
            html.eh-home-mobile-active table.itg td {
                display: block !important;
                box-sizing: border-box !important;
                min-width: 0 !important;
                width: auto !important;
                max-width: 100% !important;
                padding: 3px !important;
                border: 0 !important;
                background: transparent !important;
                vertical-align: top !important;
            }
            html.eh-home-mobile-active table.itg td.gl1c {
                grid-area: category !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active table.itg td.gl1c .cn {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                width: 100% !important;
                min-height: 34px !important;
                padding: 4px 2px !important;
                border-radius: 7px !important;
                font-size: 10px !important;
                line-height: 1.1 !important;
                text-align: center !important;
                white-space: normal !important;
            }
            html.eh-home-mobile-active table.itg td.gl2c {
                grid-area: meta !important;
                overflow: hidden !important;
                color: #adb3bf !important;
                font-size: 10px !important;
                line-height: 1.25 !important;
            }
            html.eh-home-mobile-active table.itg td.gl2c > .glcut,
            html.eh-home-mobile-active table.itg td.gl2c > .glthumb {
                display: none !important;
            }
            html.eh-home-mobile-active table.itg td.gl2c > div:last-child {
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 4px !important;
            }
            html.eh-home-mobile-active table.itg td.gl2c .ir {
                flex: 0 0 16px !important;
            }
            html.eh-home-mobile-active table.itg td.gl2c .gldown img {
                width: 16px !important;
                height: 16px !important;
                object-fit: contain !important;
            }
            html.eh-home-mobile-active table.itg td.gl3c {
                grid-area: title !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active table.itg td.gl3c > a {
                display: block !important;
                color: #e5e7eb !important;
                text-decoration: none !important;
            }
            html.eh-home-mobile-active table.itg .glink {
                margin: 0 0 5px !important;
                color: #f3f4f6 !important;
                font-size: 14px !important;
                font-weight: 650 !important;
                line-height: 1.35 !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active table.itg .gt {
                display: inline-block !important;
                max-width: 100% !important;
                margin: 2px 3px 2px 0 !important;
                padding: 2px 5px !important;
                border: 1px solid #343741 !important;
                border-radius: 5px !important;
                background: #292c34 !important;
                color: #cbd2df !important;
                font-size: 10px !important;
                line-height: 1.25 !important;
                white-space: normal !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active table.itg td.gl4c {
                grid-area: uploader !important;
                display: flex !important;
                flex-wrap: wrap !important;
                align-items: center !important;
                gap: 4px 12px !important;
                margin-top: 5px !important;
                padding-top: 6px !important;
                border-top: 1px solid #343741 !important;
                color: #9ca3af !important;
                font-size: 10px !important;
            }
            html.eh-home-mobile-active table.itg td.gl4c a {
                color: #9ca3af !important;
            }
            /* Extended mode keeps one gallery per row, with tags nested in the title cell. */
            html.eh-home-mobile-active table.itg.glte {
                display: block !important;
                width: 100% !important;
                table-layout: auto !important;
            }
            html.eh-home-mobile-active table.itg.glte > tbody {
                display: block !important;
                width: 100% !important;
            }
            html.eh-home-mobile-active table.itg.glte > tbody > tr {
                display: grid !important;
                grid-template-columns: minmax(76px, 28vw) minmax(0, 1fr) !important;
                grid-template-areas: "preview details" !important;
                align-items: start !important;
                box-sizing: border-box !important;
                width: calc(100% - 16px) !important;
                max-width: calc(100% - 16px) !important;
                min-width: 0 !important;
                margin: 0 8px 8px !important;
                padding: 7px !important;
                border: 1px solid #343741 !important;
                border-radius: 10px !important;
                background: #1e2025 !important;
            }
            html.eh-home-mobile-active table.itg.glte td.gl1e {
                grid-area: preview !important;
                display: flex !important;
                align-items: flex-start !important;
                justify-content: center !important;
                width: auto !important;
                padding: 3px !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active table.itg.glte td.gl1e > div {
                display: flex !important;
                align-items: flex-start !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                width: 100% !important;
                height: auto !important;
                max-height: 180px !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active table.itg.glte td.gl1e img {
                position: static !important;
                display: block !important;
                width: auto !important;
                height: auto !important;
                max-width: 100% !important;
                max-height: 180px !important;
                object-fit: contain !important;
            }
            html.eh-home-mobile-active table.itg.glte td.gl2e {
                grid-area: details !important;
                display: block !important;
                width: auto !important;
                min-width: 0 !important;
                padding: 3px !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active table.itg.glte td.gl2e > div {
                display: flex !important;
                flex-direction: column !important;
                align-items: stretch !important;
                box-sizing: border-box !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl3e {
                display: flex !important;
                flex-wrap: wrap !important;
                align-items: center !important;
                gap: 4px 8px !important;
                float: none !important;
                clear: both !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                color: #adb3bf !important;
                font-size: 10px !important;
                line-height: 1.3 !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl3e > div {
                float: none !important;
                flex: 0 1 auto !important;
                width: auto !important;
                max-width: 100% !important;
                min-height: 0 !important;
                margin: 0 !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl3e .cn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-height: 26px !important;
                padding: 4px 8px !important;
                border-radius: 7px !important;
                font-size: 10px !important;
                line-height: 1.2 !important;
                white-space: normal !important;
            }
            html.eh-home-mobile-active table.itg.glte td.gl2e > div > a {
                display: block !important;
                float: none !important;
                clear: both !important;
                box-sizing: border-box !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl4e {
                display: block !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                min-height: 0 !important;
                margin-top: 6px !important;
                color: #e5e7eb !important;
                font-size: 13px !important;
                line-height: 1.35 !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl4e table {
                display: block !important;
                width: 100% !important;
                margin-top: 5px !important;
                border: 0 !important;
                table-layout: fixed !important;
                border-spacing: 0 !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl4e table tbody {
                display: block !important;
                width: 100% !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl4e table tr {
                display: grid !important;
                grid-template-columns: 54px minmax(0, 1fr) !important;
                width: 100% !important;
                margin: 2px 0 !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl4e table td {
                display: flex !important;
                flex-wrap: wrap !important;
                min-width: 0 !important;
                padding: 2px !important;
                color: #cbd2df !important;
                font-size: 9px !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl4e table .gt,
            html.eh-home-mobile-active table.itg.glte .gl4e table .gtl {
                display: inline-block !important;
                max-width: 100% !important;
                margin: 2px 3px 2px 0 !important;
                padding: 2px 5px !important;
                border: 1px solid #343741 !important;
                border-radius: 5px !important;
                background: #292c34 !important;
                color: #cbd2df !important;
                font-size: 9px !important;
                line-height: 1.25 !important;
                white-space: normal !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active table.itg.glte .gl4e table td.tc {
                color: #9ca3af !important;
                font-size: 9px !important;
            }
            /* Thumbnail mode is a div grid (.gld/.gl1t), not the compact table layout. */
            html.eh-home-mobile-active .itg.gld {
                display: grid !important;
                grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)) !important;
                gap: 8px !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 0 8px !important;
            }
            html.eh-home-mobile-active .itg.gld > .gl1t {
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 6px !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 8px !important;
                border: 1px solid #343741 !important;
                border-radius: 10px !important;
                background: #1e2025 !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active .itg.gld .gl4t {
                display: block !important;
                min-width: 0 !important;
                color: #f3f4f6 !important;
                font-size: 14px !important;
                line-height: 1.35 !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-home-mobile-active .itg.gld .gl3t {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                width: 100% !important;
                height: auto !important;
                max-height: 65vh !important;
                margin: 0 auto !important;
                overflow: hidden !important;
            }
            html.eh-home-mobile-active .itg.gld .gl3t a {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                max-height: 65vh !important;
            }
            html.eh-home-mobile-active .itg.gld .gl3t img {
                position: static !important;
                display: block !important;
                width: auto !important;
                height: auto !important;
                max-width: 100% !important;
                max-height: 65vh !important;
                object-fit: contain !important;
            }
            html.eh-home-mobile-active .itg.gld .gl5t {
                display: flex !important;
                flex-wrap: wrap !important;
                justify-content: space-between !important;
                gap: 6px 12px !important;
                color: #adb3bf !important;
                font-size: 10px !important;
                line-height: 1.3 !important;
            }
            html.eh-home-mobile-active .dp {
                box-sizing: border-box !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 12px !important;
                background: #202228 !important;
                color: #9ca3af !important;
                font-size: 11px !important;
                text-align: center !important;
            }
            @media (max-width: 360px) {
                html.eh-home-mobile-active table.itg > tbody > tr:not(:first-child) {
                    grid-template-columns: 68px minmax(0, 1fr) !important;
                }
                html.eh-home-mobile-active table.itg.glte > tbody > tr {
                    grid-template-columns: minmax(64px, 25vw) minmax(0, 1fr) !important;
                }
                html.eh-home-mobile-active table.itg .glink {
                    font-size: 13px !important;
                }
            }

            /* READER /s/: ảnh vừa màn hình và điều hướng luôn nằm cạnh dưới */
            html.eh-reader-mobile-active,
            html.eh-reader-mobile-active body {
                width: 100% !important;
                max-width: 100vw !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #141518 !important;
                color: #e5e7eb !important;
                overflow-x: hidden !important;
                box-sizing: border-box !important;
            }
            html.eh-reader-mobile-active #i1.sni {
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 auto !important;
                padding: 8px 10px calc(var(--eh-reader-toolbar-height, 60px) + max(24px, env(safe-area-inset-bottom, 0px)) + 16px) !important;
            }
            html.eh-reader-mobile-active #i1 h1 {
                margin: 4px 0 10px !important;
                color: #e5e7eb !important;
                font-size: 14px !important;
                line-height: 1.4 !important;
                text-align: center !important;
                overflow-wrap: anywhere !important;
            }
            html.eh-reader-mobile-active #i1 > iframe {
                display: none !important;
            }
            html.eh-reader-mobile-active #i2 {
                width: 100% !important;
            }
            html.eh-reader-mobile-active #i2 > div:not(.sn) {
                display: none !important;
            }
            #eh-reader-control-bar {
                display: none !important;
            }
            html.eh-reader-mobile-active #i2 .sn,
            html.eh-reader-mobile-active #i4 .sn {
                display: none !important;
            }
            html.eh-reader-mobile-active #eh-reader-control-bar {
                position: fixed !important;
                z-index: 2147483647 !important;
                right: 0 !important;
                bottom: max(24px, env(safe-area-inset-bottom, 0px)) !important;
                left: 0 !important;
                box-sizing: border-box !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-around !important;
                flex-wrap: wrap !important;
                height: auto !important;
                min-height: 54px !important;
                gap: 4px !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 8px max(6px, env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-right)) !important;
                border-top: 1px solid #343741 !important;
                background: rgba(25, 27, 32, 0.97) !important;
                box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.35) !important;
                backdrop-filter: blur(10px) !important;
            }
            @media (max-width: 440px) {
                html.eh-reader-mobile-active #eh-reader-control-bar {
                    flex-wrap: nowrap !important;
                    justify-content: space-between !important;
                    gap: 3px !important;
                    padding: 6px max(6px, env(safe-area-inset-left)) calc(6px + env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-right)) !important;
                }
                html.eh-reader-mobile-active #eh-reader-control-bar > a {
                    flex: 0 0 34px !important;
                    width: 34px !important;
                    min-width: 34px !important;
                    margin: 0 !important;
                }
                html.eh-reader-mobile-active #eh-reader-control-bar > div {
                    flex: 1 1 40px !important;
                    min-width: 40px !important;
                    text-align: center !important;
                    font-size: 12px !important;
                }
                html.eh-reader-mobile-active #eh-reader-control-bar #eh-reader-view-mode {
                    flex: 0 1 108px !important;
                    width: 108px !important;
                    min-width: 0 !important;
                    max-width: 108px !important;
                    padding: 0 5px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    font-size: 11px !important;
                }
                html.eh-reader-mobile-active #eh-reader-control-bar #eh-to-mobile-switch {
                    flex: 0 0 34px !important;
                    width: 34px !important;
                    min-width: 34px !important;
                    height: 38px !important;
                    min-height: 38px !important;
                }
            }
            @media (max-width: 360px) {
                html.eh-reader-mobile-active #eh-reader-control-bar > a {
                    flex-basis: 30px !important;
                    width: 30px !important;
                    min-width: 30px !important;
                }
                html.eh-reader-mobile-active #eh-reader-control-bar > div {
                    flex-basis: 32px !important;
                    min-width: 32px !important;
                    font-size: 11px !important;
                }
                html.eh-reader-mobile-active #eh-reader-control-bar #eh-reader-view-mode {
                    flex-basis: 72px !important;
                    width: 72px !important;
                    max-width: 72px !important;
                    padding: 0 3px !important;
                    font-size: 10px !important;
                }
                html.eh-reader-mobile-active #eh-reader-control-bar #eh-to-mobile-switch {
                    flex-basis: 30px !important;
                    width: 30px !important;
                    min-width: 30px !important;
                }
            }
            html.eh-reader-mobile-active #eh-reader-control-bar a {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-width: 34px !important;
                min-height: 36px !important;
                border-radius: 9px !important;
                background: #292c34 !important;
            }
            html.eh-reader-mobile-active #eh-reader-control-bar a img {
                width: 24px !important;
                height: 24px !important;
            }
            html.eh-reader-mobile-active #eh-reader-control-bar > div {
                color: #00ff88 !important;
                font-size: 13px !important;
                font-weight: 700 !important;
                white-space: nowrap !important;
            }
            html.eh-reader-mobile-active #i3 {
                position: relative !important;
                z-index: 0 !important;
                width: 100% !important;
                margin: 0 auto !important;
                text-align: center !important;
                overflow: visible !important;
            }
            html.eh-reader-mobile-active #i3 > a {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
            }
            html.eh-reader-mobile-active #i3 #img {
                display: block !important;
                width: auto !important;
                height: auto !important;
                max-width: 100% !important;
                max-height: none !important;
                margin: 0 auto !important;
                object-fit: contain !important;
            }
            html.eh-reader-mobile-active.eh-reader-fit-screen #i3 {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-height: calc(100dvh - 120px) !important;
                overflow: auto !important;
            }
            html.eh-reader-mobile-active.eh-reader-fit-screen #i3 > a {
                width: auto !important;
                max-width: 100% !important;
            }
            html.eh-reader-mobile-active.eh-reader-fit-screen #i3 #img {
                max-width: calc(100vw - 20px) !important;
                max-height: calc(100dvh - 130px) !important;
            }
            html.eh-reader-mobile-active.eh-reader-natural-size {
                overflow-x: auto !important;
            }
            html.eh-reader-mobile-active.eh-reader-natural-size #i3 {
                overflow: auto !important;
                text-align: left !important;
            }
            html.eh-reader-mobile-active.eh-reader-natural-size #i3 > a {
                width: max-content !important;
                max-width: none !important;
            }
            html.eh-reader-mobile-active.eh-reader-natural-size #i3 #img {
                max-width: none !important;
                max-height: none !important;
                margin: 0 !important;
            }
            html.eh-reader-mobile-active #i4 {
                display: none !important;
            }
            html.eh-reader-mobile-active #i5,
            html.eh-reader-mobile-active #i6,
            html.eh-reader-mobile-active body > .dp,
            html.eh-reader-mobile-active body > iframe,
            html.eh-reader-mobile-active body > div[id]:not(#i1):not(#eh-to-mobile-switch):not(#eh-reader-control-bar):not(#eh-filter-panel):not(#eh-filter-mini-icon) {
                display: none !important;
            }
            html.eh-reader-mobile-active #eh-filter-panel,
            html.eh-reader-mobile-active #eh-filter-mini-icon {
                z-index: 2147483646 !important;
            }

            /* CONTAINER ỨNG DỤNG MOBILE CHÍNH */
            #eh-mobile-app {
                width: 100% !important;
                max-width: 600px !important;
                margin: 0 auto !important;
                padding: 10px 10px 60px 10px !important;
                box-sizing: border-box !important;
            }

            /* 1. Header */
            .eh-m-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 0 12px 0;
                border-bottom: 1px solid #282a30;
                margin-bottom: 12px;
            }
            .eh-m-logo {
                font-size: 17px;
                font-weight: 800;
                color: #00ff88;
                letter-spacing: 0.5px;
            }
            .eh-m-desktop-btn {
                background: #2b2d34;
                color: #bbb;
                border: 1px solid #444752;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
            }

            /* 2. Hero Card */
            .eh-m-hero-card {
                background: #1e2025;
                border-radius: 12px;
                padding: 14px;
                border: 1px solid #2d3039;
                box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                margin-bottom: 12px;
                text-align: center;
            }
            .eh-m-cover-wrap {
                display: flex;
                justify-content: center;
                margin-bottom: 12px;
            }
            .eh-m-cover-img {
                max-width: 240px;
                width: auto;
                max-height: 340px;
                border-radius: 8px;
                box-shadow: 0 6px 18px rgba(0,0,0,0.6);
            }
            .eh-m-badge-row {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            .eh-m-cat {
                display: inline-block;
                padding: 3px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                color: #fff;
            }
            .eh-m-rating {
                font-size: 12px;
                color: #ffaa00;
                font-weight: bold;
            }
            .eh-m-title-en {
                font-size: 16px;
                font-weight: bold;
                color: #fff;
                line-height: 1.4;
                margin: 6px 0;
                word-break: break-word;
            }
            .eh-m-title-jp {
                font-size: 13px;
                color: #9ca3af;
                line-height: 1.3;
                margin-bottom: 6px;
                word-break: break-word;
            }
            .eh-m-uploader {
                font-size: 12px;
                color: #9ca3af;
                margin-top: 6px;
            }
            .eh-m-uploader a {
                color: #38bdf8;
                text-decoration: none;
                font-weight: bold;
            }

            /* 3. Action Buttons */
            .eh-m-action-bar {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
            }
            .eh-m-btn {
                flex: 1;
                padding: 10px 6px;
                border-radius: 8px;
                border: 1px solid #3c404b;
                background: #252830;
                color: #fff;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                transition: transform 0.1s;
            }
            .eh-m-btn:active {
                transform: scale(0.97);
            }
            .eh-m-btn-fav {
                background: #00aa55;
                border-color: #00ff88;
                color: #fff;
            }

            /* 4. Section Card */
            .eh-m-section-card {
                background: #1e2025;
                border-radius: 12px;
                padding: 12px;
                border: 1px solid #2d3039;
                margin-bottom: 12px;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            }
            .eh-m-section-title {
                font-size: 14px;
                font-weight: bold;
                color: #00ff88;
                margin: 0 0 10px 0;
            }

            /* 5. Meta Grid */
            .eh-m-meta-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            .eh-m-meta-item {
                background: #17181c;
                padding: 6px 10px;
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .eh-m-meta-key {
                font-size: 11px;
                color: #888;
            }
            .eh-m-meta-val {
                font-size: 12px;
                color: #e5e7eb;
                font-weight: 500;
                word-break: break-word;
            }

            /* 6. Tags Cloud */
            .eh-m-tags-container {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .eh-m-tag-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
                border-bottom: 1px dashed #2d3039;
                padding-bottom: 6px;
            }
            .eh-m-tag-group:last-child {
                border-bottom: none;
                padding-bottom: 0;
            }
            .eh-m-tag-cat {
                font-size: 11px;
                font-weight: bold;
                color: #9ca3af;
                text-transform: uppercase;
            }
            .eh-m-tag-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }
            .eh-m-tag-chip {
                background: #141518;
                color: #cbd5e1;
                border: 1px solid #333640;
                border-radius: 50px;
                padding: 4px 10px;
                font-size: 11px;
                text-decoration: none;
                line-height: 1.2;
            }
            .eh-m-tag-chip:active {
                background: #00aa55;
                color: #fff;
            }

            /* 7. Lưới Thumbnails: Co dãn vừa vặn trọn vẹn, không cắt hình */
            .eh-m-thumbs-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
                align-items: stretch;
            }
            @media (max-width: 360px) {
                .eh-m-thumbs-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
            .eh-m-thumb-card {
                background: #17181c;
                border-radius: 8px;
                overflow: hidden;
                border: 1px solid #2e313b;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                text-decoration: none;
                box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                transition: transform 0.1s;
            }
            .eh-m-thumb-card:active {
                transform: scale(0.97);
            }
            .eh-m-thumb-preview {
                width: 100%;
                /* Để chiều cao tự co dãn theo ảnh, không giới hạn cố định 90px */
                height: auto;
                min-height: 120px;
                display: flex;
                justify-content: center;
                align-items: center;
                background: #101114;
                padding: 6px 2px;
                box-sizing: border-box;
                flex: 1;
            }
            .eh-m-thumb-preview img {
                max-width: 100% !important;
                height: auto !important;
                object-fit: contain !important;
            }
            .eh-m-thumb-footer {
                padding: 5px 6px;
                background: #1e2025;
                border-top: 1px solid #282a32;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
                color: #aaa;
            }
            .eh-m-anim-badge {
                background: #00ff88;
                color: #000;
                font-size: 9px;
                font-weight: 800;
                padding: 1px 4px;
                border-radius: 3px;
            }

            /* 8. Phân trang */
            .eh-m-pagination-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                margin-top: 12px;
                padding: 10px;
                background: #1e2025;
                border-radius: 10px;
                border: 1px solid #2d3039;
            }
            .eh-m-page-nav {
                padding: 8px 14px;
                background: #2b2e37;
                color: #fff;
                border-radius: 6px;
                text-decoration: none;
                font-size: 12px;
                font-weight: bold;
                border: 1px solid #404452;
            }
            .eh-m-page-nav.disabled {
                opacity: 0.3;
                pointer-events: none;
            }
            .eh-m-page-info {
                font-size: 13px;
                font-weight: bold;
                color: #00ff88;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }
})();
