function main() {
    // Esta función se ejecuta solo DESPUÉS de que todo el HTML de los componentes se ha cargado.
    AOS.init({ duration: 800, once: true });

    // ==========================================================
    // === 1. VARIABLES GLOBALES ===
    // ==========================================================
    let cart = [];
    let currentUserEmail = null;
    let userPurchases = []; 
    let allProducts = [];
    
    // --- VARIABLES DE MONEDA ---
    let userCurrency = 'MXN';
    let conversionRate = 1;
    
    // --- CONFIGURACIÓN DE PAYPAL ---
    const PAYPAL_CLIENT_ID = 'AT16Qo7wfSCrBn9YBDsi-GfsTTI4ce411w4BM2GMNNM-iaVRajGBBC_VfvQFiNbiYDk4IzlJ1sXgigLc';
    // Control para evitar recargas innecesarias
    let currentPayPalCurrency = ''; 

    // Elementos del DOM
    let cartCountEl, cartItemsContainer, cartTotalEl, checkoutContainer, paymentStatusEl, cartModalEl, cartModal, dynamicNavLinks, toastEl, toast, toastBodyEl;
    let pdfViewerModalEl, pdfViewerModal, pdfCanvas, pdfCanvasContainer, pageNumEl, pageCountEl, prevPageBtn, nextPageBtn, zoomInBtn, zoomOutBtn;
    let purchasedModalEl, purchasedModal, purchasedProductNameEl;
    let productDetailModalEl, productDetailModal; 
    
    let pdfDoc = null, pageNum = 1, pageIsRendering = false, pageNumIsPending = null, previewPageLimit = 0;
    let currentScale = 1.0; 

    // --- 1. Inicializar todas las variables del DOM ---
    function initializeDOMElements() {
        cartItemsContainer = document.getElementById('cartItemsContainer');
        cartTotalEl = document.getElementById('cartTotal');
        checkoutContainer = document.getElementById('checkout-container');
        paymentStatusEl = document.getElementById('payment-status');
        
        const cartEl = document.getElementById('cartModal');
        if (cartEl) {
            cartModalEl = cartEl;
            cartModal = new bootstrap.Modal(cartModalEl);
        }

        dynamicNavLinks = document.getElementById('dynamic-nav-links');
        
        toastEl = document.getElementById('liveToast'); 
        if (toastEl) {
            toastBodyEl = toastEl.querySelector('.toast-body-main') || toastEl.querySelector('.toast-body');
            toast = new bootstrap.Toast(toastEl);
        }
        
        pdfViewerModalEl = document.getElementById('pdfViewerModal');
        if (pdfViewerModalEl) {
            pdfViewerModal = new bootstrap.Modal(pdfViewerModalEl);
            pdfCanvas = document.getElementById('pdf-canvas');
            pdfCanvasContainer = document.getElementById('pdf-canvas-container');
            pageNumEl = document.getElementById('page-num');
            pageCountEl = document.getElementById('page-count');
            prevPageBtn = document.getElementById('prev-page');
            nextPageBtn = document.getElementById('next-page');
            zoomInBtn = document.getElementById('zoom-in');
            zoomOutBtn = document.getElementById('zoom-out');
        }
        
        purchasedModalEl = document.getElementById('alreadyPurchasedModal');
        if (purchasedModalEl) {
            purchasedModal = new bootstrap.Modal(purchasedModalEl);
            purchasedProductNameEl = document.getElementById('purchased-product-name');
        }

        productDetailModalEl = document.getElementById('productDetailModal');
        if (productDetailModalEl) {
            productDetailModal = new bootstrap.Modal(productDetailModalEl);
        }
    }

    // ==========================================================
    // === 2. FUNCIONES DE UTILIDAD (Toast y Moneda) ===
    // ==========================================================

    function showAppToast(message, type = 'info') {
        if (!toastEl || !toast) return console.log(message);
        
        const specificItemEl = document.getElementById('toast-item-name-container');
        if (specificItemEl) specificItemEl.style.display = 'none'; 
        
        if(toastBodyEl) {
            toastBodyEl.textContent = message;
            toastBodyEl.style.display = 'block';
        }
        
        toastEl.className = `toast align-items-center text-white border-0 bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'}`;
        toast.show();
    }
    
    function showItemAddedToast(name) {
        if (!toastEl || !toast) return;
        if (toastBodyEl) toastBodyEl.style.display = 'none'; 
        const specificItemEl = document.getElementById('toast-item-name-container');
        if (specificItemEl) {
            const nameEl = document.getElementById('toast-item-name');
            if(nameEl) nameEl.textContent = name;
            specificItemEl.style.display = 'block';
        }
        toastEl.className = 'toast align-items-center text-white border-0 bg-success';
        toast.show();
    }

    // ==========================================================
    // === 4. UTILIDADES GENERALES ===
    // ==========================================================

    const formatMoney = (n) => n.toFixed(2);
    const calculateTotal = () => cart.reduce((total, item) => total + (item.price * item.qty), 0);
    
    const updateCartBadge = () => {
        const el = document.getElementById('cart-count');
        if (el) el.textContent = cart.reduce((s, it) => s + it.qty, 0);
    };

    const saveCartToStorage = () => { if (currentUserEmail) localStorage.setItem(`cart_${currentUserEmail}`, JSON.stringify(cart)); };
    
    const loadCartFromStorage = () => {
        if (currentUserEmail) {
            const savedCart = localStorage.getItem(`cart_${currentUserEmail}`);
            if (savedCart) { try { const p = JSON.parse(savedCart); if (Array.isArray(p)) cart = p; } catch (e) { cart = []; } } else { cart = []; }
        } else {
            const tempCart = localStorage.getItem('savedCart');
            if (tempCart) {
                try { const p = JSON.parse(tempCart); if (Array.isArray(p)) cart.push(...p); } catch (e) { console.error("Error parsing temp cart", e); }
                localStorage.removeItem('savedCart');
            } else { cart = []; }
        }
    };

    // ==========================================================
    // === 5. LÓGICA DE MONEDA Y BANDERAS ===
    // ==========================================================
    
    function getFlagEmoji(currency) {
        const map = { 
            'MXN': '🇲🇽', 'USD': '🇺🇸', 'CAD': '🇨🇦',
            'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵',
            'ARS': '🇦🇷', 'COP': '🇨🇴', 'BRL': '🇧🇷', 'CLP': '🇨🇱', 'PEN': '🇵🇪', 'UYU': '🇺🇾',
            'BOB': '🇧🇴', 'VES': '🇻🇪', 'CRC': '🇨🇷', 'GTQ': '🇬🇹'
        };
        return map[currency] || '🌐';
    }

    async function changeUserCurrency(newCurrencyCode) {
        showAppToast(`Cambiando moneda a ${newCurrencyCode}...`, 'info');
        try {
            localStorage.setItem('selected_currency', newCurrencyCode);

            const response = await fetch(`/api/location-currency?currency=${newCurrencyCode}`);
            const data = await response.json();

            userCurrency = data.currencyCode;
            conversionRate = data.conversionRate;

            await loadAllProducts(); 
            renderCart(); 
            
            const flagEl = document.getElementById('current-currency-flag');
            if(flagEl) flagEl.textContent = getFlagEmoji(userCurrency);

            // Forzar recarga de PayPal:
            // Borramos la referencia de la moneda actual para que loadPayPalScript sepa que debe recargar
            currentPayPalCurrency = ''; 
            // Limpiamos el contenedor visualmente
            if(checkoutContainer) checkoutContainer.innerHTML = ''; 
            
            showAppToast(`Moneda actualizada a ${userCurrency}`, 'success');
        } catch (error) {
            console.error(error);
            showAppToast('Error al cambiar de moneda', 'error');
        }
    }
    
    window.triggerCurrencyChange = (code) => changeUserCurrency(code);

    // ==========================================================
    // === 6. RENDERIZADO DEL MENÚ ===
    // ==========================================================
    function renderNavMenu(sessionData) {
        let staticLinks = `
            <li class="nav-item"><a class="nav-link" href="#inicio">Inicio</a></li>
            <li class="nav-item"><a class="nav-link" href="#planes">Planes</a></li>
            <li class="nav-item"><a class="nav-link" href="#productos">Productos</a></li>
        `;

        const currencySelectorHtml = `
            <li class="nav-item dropdown ms-lg-2">
                <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" title="Cambiar Moneda">
                    <span id="current-currency-flag" style="font-size: 1.2rem;">${getFlagEmoji(userCurrency)}</span>
                </a>
                <ul class="dropdown-menu dropdown-menu-dark" style="min-width: auto; max-height: 300px; overflow-y: auto;">
                    <li><h6 class="dropdown-header text-warning">Norteamérica</h6></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('MXN')">🇲🇽 MXN</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('USD')">🇺🇸 USD</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('CAD')">🇨🇦 CAD</button></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><h6 class="dropdown-header text-warning">Latinoamérica</h6></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('ARS')">🇦🇷 ARS</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('COP')">🇨🇴 COP</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('BRL')">🇧🇷 BRL</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('CLP')">🇨🇱 CLP</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('PEN')">🇵🇪 PEN</button></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><h6 class="dropdown-header text-warning">Europa & Mundo</h6></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('EUR')">🇪🇺 EUR</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('GBP')">🇬🇧 GBP</button></li>
                    <li><button class="dropdown-item" onclick="window.triggerCurrencyChange('JPY')">🇯🇵 JPY</button></li>
                </ul>
            </li>
        `;

        const searchBarHtml = `
            <li class="nav-item ms-lg-3 me-lg-2">
                <form class="d-flex nav-search-form" id="productSearchForm" role="search">
                    <i class="bi bi-search"></i>
                    <input class="form-control nav-search-input" type="search" id="navSearchInput" placeholder="Buscar..." aria-label="Buscar">
                </form>
            </li>
        `;

        let dynamicLinks = '';
        if (sessionData.loggedIn) {
            currentUserEmail = sessionData.user.email;
            dynamicLinks = `
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown">
                        <i class="bi bi-person-circle me-1"></i> ${sessionData.user.name}
                    </a>
                    <ul class="dropdown-menu dropdown-menu-dark" aria-labelledby="navbarDropdown">
                        <li><a class="dropdown-item" href="returns.html">Mis Compras</a></li>
                        <li><a class="dropdown-item" href="fac.html">Facturación</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><button id="logoutBtnNav" class="dropdown-item">Cerrar Sesión</button></li>
                    </ul>
                </li>
            `;
        } else {
            currentUserEmail = null;
            dynamicLinks = `
                <li class="nav-item"><a class="nav-link" href="login.html">Iniciar Sesión</a></li>
                <li class="nav-item"><a class="nav-link" href="register.html">Registrarse</a></li>
            `;
        }
        
        const cartLink = `
            <li class="nav-item">
                <a class="nav-link position-relative" href="#" data-bs-toggle="modal" data-bs-target="#cartModal">
                    <i class="bi bi-cart-fill" style="font-size:1.25rem"></i>
                    <span class="badge bg-danger rounded-pill cart-badge" id="cart-count">0</span>
                </a>
            </li>
        `;
        
        dynamicNavLinks.innerHTML = staticLinks + currencySelectorHtml + searchBarHtml + dynamicLinks + cartLink;

        if (sessionData.loggedIn) {
            const logoutBtn = document.getElementById('logoutBtnNav');
            if(logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    saveCartToStorage();
                    fetch('/logout', { method: 'POST' }).then(() => window.location.reload());
                });
            }
        }
        
        const searchForm = document.getElementById('productSearchForm');
        const searchInput = document.getElementById('navSearchInput');
        if(searchForm && searchInput) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                performSearch(searchInput.value.toLowerCase().trim());
            });
            searchInput.addEventListener('keyup', (e) => {
                 performSearch(e.target.value.toLowerCase().trim());
            });
        }

        updateCartBadge();
    }

    // ==========================================================
    // === 7. CARGA DINÁMICA DE PAYPAL (SOLUCIÓN DE ERRORES) ===
    // ==========================================================
    function loadPayPalScript(currency, onReadyCallback) {
        // 1. Si la moneda es la misma que ya tenemos cargada Y el objeto global existe
        if (currentPayPalCurrency === currency && window.paypal) {
            onReadyCallback();
            return;
        }

        // 2. Limpieza profunda si cambiamos de moneda o hubo error
        // Eliminamos el script anterior del DOM
        const existingScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
        if (existingScript) {
            existingScript.parentNode.removeChild(existingScript);
        }
        // Eliminamos el objeto global para asegurar una recarga limpia
        window.paypal = undefined;
        
        // Limpiamos el contenedor visualmente
        if(checkoutContainer) checkoutContainer.innerHTML = '<div class="text-center p-3"><span class="spinner-border spinner-border-sm text-warning"></span> Cargando método de pago...</div>';
        if(paymentStatusEl) paymentStatusEl.innerHTML = '';

        // 3. Crear y cargar el nuevo script
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=${currency}`;
        script.async = true;
        
        script.onload = () => {
            console.log(`✅ PayPal SDK cargado para ${currency}`);
            currentPayPalCurrency = currency;
            onReadyCallback();
        };
        
        script.onerror = () => {
            console.error("Error cargando PayPal SDK");
            if(checkoutContainer) checkoutContainer.innerHTML = '<p class="text-center text-danger">Error de conexión con PayPal. Recarga la página e intenta de nuevo.</p>';
        };
        
        document.body.appendChild(script);
    }

    // ==========================================================
    // === 8. RENDERIZADO DE BOTONES DE PAGO ===
    // ==========================================================
    function renderCheckoutSection(sessionData) {
        if(!checkoutContainer) return;
        
        // IMPORTANTE: Limpiar el contenedor para evitar "zoid: request listener exists"
        checkoutContainer.innerHTML = ''; 
        if(paymentStatusEl) paymentStatusEl.innerHTML = '';
        
        const totalMXN = calculateTotal();
        const totalConverted = totalMXN * conversionRate;

        if (totalConverted <= 0) {
            checkoutContainer.innerHTML = '<p class="text-muted text-center">Tu carrito está vacío.</p>';
            return;
        }

        if (sessionData.loggedIn) {
            // Verificamos de nuevo si paypal existe antes de intentar renderizar
            if (window.paypal) {
                try {
                    window.paypal.Buttons({
                        createOrder: async () => {
                            try {
                                const response = await fetch('/api/orders', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ 
                                        totalAmount: totalConverted.toFixed(2),
                                        currencyCode: userCurrency 
                                    })
                                });
                                if (!response.ok) { const txt = await response.text(); throw new Error(txt); }
                                const orderData = await response.json();
                                return orderData.id;
                            } catch (error) {
                                console.error("CreateOrder Error:", error);
                                if(paymentStatusEl) paymentStatusEl.innerHTML = `<div class="alert alert-danger small">Error al crear orden: ${error.message}</div>`;
                                return Promise.reject(error);
                            }
                        },
                        onApprove: (data) => {
                            paymentStatusEl.innerHTML = `<div class="alert alert-info small">Procesando pago...</div>`;
                            return fetch(`/api/orders/${data.orderID}/capture`, { 
                                method: 'POST', headers: { 'Content-Type': 'application/json' }
                            })
                            .then(res => res.json())
                            .then(captureData => {
                                const productNames = cart.map(item => item.name).join(', ');
                                const payerName = captureData.payer.name.given_name + ' ' + captureData.payer.name.surname;
                                const purchaseData = {
                                    userEmail: sessionData.user.email,
                                    cardName: payerName,
                                    paypalTransactionId: captureData.id,
                                    productName: productNames,
                                    price: totalConverted.toFixed(2),
                                    currency: userCurrency
                                };
                                return fetch('/process-purchase', { 
                                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(purchaseData) 
                                });
                            })
                            .then(res => res.json())
                            .then(serverData => {
                                if (serverData.success) {
                                    showAppToast('¡Compra exitosa! Revisa tu correo.', 'success');
                                    cart = [];
                                    renderCart();
                                    fetch('/my-purchases').then(res => res.json()).then(p => userPurchases = p);
                                    setTimeout(() => cartModal.hide(), 2000);
                                } else { throw new Error(serverData.message); }
                            })
                            .catch(err => {
                                console.error(err);
                                paymentStatusEl.innerHTML = `<div class="alert alert-danger small">Error al registrar compra. Contáctanos.</div>`;
                            });
                        },
                        onError: (err) => {
                            console.error("PayPal Window Error:", err);
                            paymentStatusEl.innerHTML = `<div class="alert alert-warning small">El pago no se completó. Intenta de nuevo.</div>`;
                        }
                    }).render(checkoutContainer);
                } catch(e) {
                     console.error("Error al renderizar botón PayPal:", e);
                     // Si falla el renderizado, intentamos recargar el script en el próximo intento
                     currentPayPalCurrency = ''; 
                }
            } else {
                 checkoutContainer.innerHTML = '<p class="text-danger text-center">Error: PayPal no cargó correctamente. Cierra y abre el carrito.</p>';
            }
        } else {
            const loginBtn = document.createElement('button');
            loginBtn.className = 'btn btn-accent w-100';
            loginBtn.textContent = 'Iniciar Sesión para Pagar';
            loginBtn.onclick = () => { localStorage.setItem('savedCart', JSON.stringify(cart)); window.location.href = 'login.html'; };
            checkoutContainer.appendChild(loginBtn);
        }
    }

    // ==========================================================
    // === 9. FUNCIONES DEL CARRITO ===
    // ==========================================================
    
    function renderCart() {
        if (!cartItemsContainer || !cartTotalEl) return;
        cartItemsContainer.innerHTML = cart.length === 0 ? '<p class="text-muted text-center">Tu carrito está vacío</p>' : '';
        let subtotalMXN = 0;
        cart.forEach((item, idx) => {
            const itemTotalMXN = item.price * item.qty;
            subtotalMXN += itemTotalMXN;
            const displayPrice = itemTotalMXN * conversionRate; 
            const itemDiv = document.createElement('div');
            itemDiv.className = 'd-flex align-items-center justify-content-between cart-item mb-3';
            itemDiv.innerHTML = `
                <div><strong>${item.name}</strong><div class="small text-muted text-uppercase">${item.type}</div></div>
                <div class="d-flex align-items-center gap-2">
                    <span>$${formatMoney(displayPrice)} ${userCurrency}</span>
                    <input type="number" min="1" value="${item.qty}" class="form-control form-control-sm bg-dark text-white quantity-input" style="width:60px" data-idx="${idx}">
                    <button class="btn btn-sm btn-outline-danger remove-btn" data-idx="${idx}"><i class="bi bi-trash-fill"></i></button>
                </div>`;
            cartItemsContainer.appendChild(itemDiv);
        });
        const totalConverted = subtotalMXN * conversionRate;
        cartTotalEl.textContent = `${formatMoney(totalConverted)} ${userCurrency}`;
        updateCartBadge();
        addCartEventListeners();
        saveCartToStorage();
    }
    
    function addCartEventListeners() {
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                if(cart[idx]) { cart[idx].qty = parseInt(e.target.value) || 1; renderCart(); }
            });
        });
        document.querySelectorAll('.remove-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx);
                cart.splice(idx, 1);
                renderCart();
            });
        });
    }

    // ==========================================================
    // === 10. LOGICA DE PRODUCTOS Y EVENTOS ===
    // ==========================================================

    // ESTA FUNCIÓN ES LA CLAVE: Se llama al cargar productos para reactivar botones
    function bindProductCardEvents() {
        // 1. Botones "Agregar al Carrito"
        document.querySelectorAll('.add-to-cart').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = button.dataset.name;
                const type = button.dataset.type;
                const price = parseFloat(button.dataset.price); 

                fetch('/check-session').then(res => res.json()).then(sessionData => {
                    if (sessionData.loggedIn) {
                        const already = userPurchases.some(p => (p.productName || '').includes(name) && p.status === 'COMPLETADO');
                        if (already) return showAlreadyPurchasedModal(name);

                        const item = cart.find(i => i.name === name);
                        if (item) item.qty++; else cart.push({ name, type, price, qty: 1 });
                        
                        renderCart();
                        showItemAddedToast(name);
                        cartModal.show();
                    } else {
                        showAppToast('Inicia sesión para comprar.', 'info');
                        localStorage.setItem('savedCart', JSON.stringify([{ name, type, price, qty: 1 }]));
                        setTimeout(() => window.location.href = 'login.html', 1500);
                    }
                });
            });
        });

        // 2. Botones "Ver PDF" (Vista Previa)
        document.querySelectorAll('.view-pdf-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.pdfUrl;
                if (!url || url === 'null') return;
                previewPageLimit = parseInt(btn.dataset.previewPages, 10);
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;
                pdfjsLib.getDocument(url).promise.then(doc => {
                    pdfDoc = doc; pageCountEl.textContent = doc.numPages; pageNum = 1; currentScale = 1.0;
                    renderPage(pageNum); pdfViewerModal.show();
                }).catch(() => showAppToast('Error al cargar PDF', 'error'));
            });
        });

        // 3. Botones "Reseñas"
        document.querySelectorAll('.view-product-details').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('button.add-to-cart')) return;
                openProductModal(e.currentTarget.dataset.productId);
            });
        });
    }

    async function loadAllProducts() {
        try {
            const response = await fetch('/api/products');
            const products = await response.json();
            allProducts = products;

            const planesContainer = document.getElementById('planes-container');
            const librosContainer = document.getElementById('libros-container');
            const productosContainer = document.getElementById('productos-container-row');
            
            if (!planesContainer || !librosContainer || !productosContainer) { return; }

            planesContainer.innerHTML = '';
            librosContainer.innerHTML = '';
            productosContainer.innerHTML = '';

            products.forEach(p => {
                const avgRating = p.avg_rating || 0;
                const reviewCount = p.review_count || 0;
                const starsHtml = avgRating > 0 ? renderStars(avgRating) : '<span class="text-muted small">Sin reseñas</span>';
                
                const price = parseFloat(p.price) || 0;
                // PRECIO DINAMICO
                const displayPrice = price * conversionRate; 

                const isPdfProduct = p.pdf_url && p.pdf_url !== 'null';
                const imgClasses = isPdfProduct ? "card-img-top-custom view-pdf-btn" : "card-img-top-custom";
                const imgCursor = isPdfProduct ? "cursor: pointer;" : "";
                const imgData = isPdfProduct ? `data-pdf-url="${p.pdf_url}" data-preview-pages="${p.preview_pages || 0}"` : "";
                
                const reviewButton = `<button class="btn btn-outline-light btn-sm view-product-details" data-product-id="${p.id}"><i class="bi bi-star-fill"></i> Reseñas</button>`;
                
                const cardContent = `
                    <div class="card-pro d-flex flex-column">
                        <img class="${imgClasses}" src="${p.image_url}" alt="${p.name}" ${imgData} style="${imgCursor}">
                        <div class="p-4 d-flex flex-column flex-grow-1">
                            <h4 class="mb-1 fw-bold view-product-details" style="cursor:pointer" data-product-id="${p.id}">${p.name}</h4>
                            <div class="star-rating mb-2 view-product-details" style="cursor:pointer" data-product-id="${p.id}">${starsHtml} <span class="text-muted small">(${reviewCount})</span></div>
                            <p class="text-muted">${p.description}</p>
                            <div class="d-flex justify-content-between align-items-center mt-auto pt-3">
                                <div class="price">$${formatMoney(displayPrice)} ${userCurrency}</div>
                                <div class="d-flex gap-2">
                                    ${p.category === 'producto' ? reviewButton : ''}
                                    <button class="btn btn-accent add-to-cart" data-type="${p.category}" data-name="${p.name}" data-price="${price}" data-product-id="${p.id}"><i class="bi bi-cart-plus-fill"></i> Agregar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                const colClass = (p.category === 'plan' || p.category === 'libro') ? 'col-lg-6' : 'col-md-4';
                const itemHtml = `<div class="${colClass}" data-aos="fade-up">${cardContent}</div>`;

                if (p.category === 'plan') planesContainer.innerHTML += itemHtml;
                else if (p.category === 'libro') librosContainer.innerHTML += itemHtml;
                else productosContainer.innerHTML += itemHtml;
            });

            // ¡IMPORTANTE! Volver a asignar eventos a los nuevos botones
            bindProductCardEvents();
            
            return true;
        } catch (error) {
            console.error("Error al cargar productos:", error);
            return false;
        }
    }

    function performSearch(searchTerm) {
        const products = document.querySelectorAll('.card-pro');
        let productFound = false;
        products.forEach(product => {
            const cardColumn = product.closest('.col-lg-6, .col-md-4');
            const text = product.innerText.toLowerCase();
            if (text.includes(searchTerm)) { cardColumn.style.display = 'block'; productFound = true; } else { cardColumn.style.display = 'none'; }
        });
        if (searchTerm === "") products.forEach(p => p.closest('.col-lg-6, .col-md-4').style.display = 'block');
        if (searchTerm.length > 0 && productFound) document.getElementById('planes').scrollIntoView({ behavior: 'smooth' });
    }

    // ==========================================================
    // === 11. FUNCIONES DE VISOR Y RESEÑAS ===
    // ==========================================================

    function initializeStaticEventListeners() {
        // Controles PDF (estáticos, no se borran)
        prevPageBtn.addEventListener('click', () => { if (pageNum > 1) { pageNum--; queueRenderPage(pageNum); } });
        nextPageBtn.addEventListener('click', () => { if (pageNum < pdfDoc.numPages) { pageNum++; queueRenderPage(pageNum); } });
        zoomInBtn.addEventListener('click', () => { if (currentScale < 3.0) { currentScale += 0.25; renderPage(pageNum); } });
        zoomOutBtn.addEventListener('click', () => { if (currentScale > 0.5) { currentScale -= 0.25; renderPage(pageNum); } });
        
        // Eventos iniciales
        addCartEventListeners();
    }

    function renderStars(avg) {
        let s = ''; const r = Math.round(avg * 2) / 2;
        for(let i=1; i<=5; i++) s += (i<=r ? '<i class="bi bi-star-fill"></i>' : (i-0.5===r ? '<i class="bi bi-star-half"></i>' : '<i class="bi bi-star"></i>'));
        return s;
    }
    
    const queueRenderPage = num => { if (pageIsRendering) pageNumIsPending = num; else renderPage(num); };
    const renderPage = num => {
        pageIsRendering = true;
        const wm = document.getElementById('watermark'); if(wm) wm.remove();
        if(num > previewPageLimit) {
            const div = document.createElement('div'); div.id='watermark'; div.className='watermark-overlay';
            div.innerHTML = `<div class="icon"><i class="bi bi-lock-fill"></i></div><div>PAGA PARA DESBLOQUEAR</div><button class="btn btn-accent mt-3">Comprar</button>`;
            pdfCanvasContainer.appendChild(div);
            div.querySelector('button').onclick = () => { pdfViewerModal.hide(); const b = document.querySelector(`.add-to-cart[data-pdf-url$="${pdfDoc.url.split('/').pop()}"]`); if(b) b.click(); };
            pdfCanvas.getContext('2d').clearRect(0,0,pdfCanvas.width, pdfCanvas.height); pageNumEl.textContent = num; pageIsRendering=false; return;
        }
        pdfDoc.getPage(num).then(p => {
            const v = p.getViewport({scale: currentScale}); pdfCanvas.height = v.height; pdfCanvas.width = v.width;
            p.render({canvasContext: pdfCanvas.getContext('2d'), viewport:v}).promise.then(()=>{ pageIsRendering=false; if(pageNumIsPending!==null){ renderPage(pageNumIsPending); pageNumIsPending=null; } });
        });
        pageNumEl.textContent = num;
    };

    function showAlreadyPurchasedModal(name) { purchasedProductNameEl.textContent = name; purchasedModal.show(); }
    
    async function fetchAndRenderReviews(id) {
        const c = document.getElementById('review-list-container'); c.innerHTML = 'Cargando...';
        try { const r = await(await fetch(`/api/products/${id}/reviews`)).json(); 
        c.innerHTML = r.length ? r.map(v => `<div class="mb-3 p-3 bg-dark rounded"><strong>${v.user_name}</strong> ${renderStars(v.rating)}<p class="small text-muted">${new Date(v.created_at).toLocaleDateString()}</p><p>${v.comment}</p></div>`).join('') : 'Sin reseñas.';
        } catch(e) { c.innerHTML = 'Error cargando reseñas.'; }
    }
    
    async function handleReviewSubmit(e, id) {
        e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled=true;
        try { const res = await fetch(`/api/products/${id}/reviews`, {method:'POST', body: new FormData(e.target)});
        const d = await res.json(); if(d.success) { showAppToast('Reseña enviada', 'success'); e.target.reset(); fetchAndRenderReviews(id); } else showAppToast(d.message, 'error');
        } catch(err) { showAppToast('Error de conexión', 'error'); } finally { btn.disabled=false; }
    }
    
    async function openProductModal(id) {
        const p = allProducts.find(x => x.id == id); if(!p) return;
        document.getElementById('product-detail-title').textContent = p.name;
        document.getElementById('product-detail-img').src = p.image_url;
        document.getElementById('product-detail-name').textContent = p.name;
        document.getElementById('product-detail-desc').textContent = p.description;
        document.getElementById('product-detail-price').textContent = `$${formatMoney(parseFloat(p.price)*conversionRate)} ${userCurrency}`;
        document.getElementById('product-detail-stars-avg').innerHTML = renderStars(p.avg_rating);
        const btn = document.getElementById('product-detail-add-btn');
        btn.dataset.name = p.name; btn.dataset.type = p.category; btn.dataset.price = parseFloat(p.price);
        fetchAndRenderReviews(id);
        const form = document.getElementById('reviewForm');
        if(currentUserEmail && userPurchases.some(x => (x.productName||'').includes(p.name) && x.status==='COMPLETADO')) {
            form.style.display='block'; form.onsubmit=(e)=>handleReviewSubmit(e, id);
        } else form.style.display='none';
        productDetailModal.show();
    }

    // ==========================================================
    // === 12. INICIO DE LA APP (PERSISTENCIA) ===
    // ==========================================================
    initializeDOMElements();

    async function startPage() {
        try {
            // 1. Recuperar preferencia guardada
            const storedCurrency = localStorage.getItem('selected_currency');
            
            // 2. Construir URL de fetch
            let currencyUrl = '/api/location-currency';
            if (storedCurrency) {
                currencyUrl += `?currency=${storedCurrency}`; 
            }

            const [sessionRes, locRes] = await Promise.all([
                fetch('/check-session'),
                fetch(currencyUrl)
            ]);
            const sessionData = await sessionRes.json();
            const locData = await locRes.json();

            // 3. Establecer moneda inicial
            userCurrency = locData.currencyCode || 'MXN';
            conversionRate = locData.conversionRate || 1;

            renderNavMenu(sessionData);
            loadCartFromStorage();
            
            // Carga inicial de productos + asignación de eventos
            await loadAllProducts(); 
            renderCart();
            initializeStaticEventListeners();
            
            if (sessionData.loggedIn) {
                try { userPurchases = await (await fetch('/my-purchases')).json(); } catch(e){}
            }

            // EVENTO CARRITO
            if(cartModalEl) {
                cartModalEl.addEventListener('shown.bs.modal', () => {
                    fetch('/check-session')
                        .then(r => r.json())
                        .then(sData => {
                            loadPayPalScript(userCurrency, () => {
                                renderCheckoutSection(sData);
                            });
                        });
                });
            }

        } catch (e) {
            console.error("Error inicio:", e);
        }
    }

    startPage();
}