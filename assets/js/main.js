function main() {
    // Esta función se ejecuta solo DESPUÉS de que todo el HTML de los componentes se ha cargado.
    AOS.init({ duration: 800, once: true });

    // ===== VARIABLES GLOBALES =====
    let cart = [];
    let currentUserEmail = null;
    let userPurchases = []; // Para el historial de compras
    let allProducts = []; // Para acceder a los datos del producto

    // --- VARIABLES DE MONEDA ---
    let userCurrency = 'MXN';
    let conversionRate = 1;

    // --- INICIO DE CORRECCIÓN: Variables de PayPal ---
    // Tu Client ID (lo tomé de tu HTML anterior)
    const PAYPAL_CLIENT_ID = 'AT16Qo7wfSCrBn9YBDsi-GfsTTI4ce411w4BM2GMNNM-iaVRajGBBC_VfvQFiNbiYDk4IzlJ1sXgigLc';
    // Bandera para no cargar el script varias veces
    let isPayPalScriptLoaded = false; 
    // --- FIN DE CORRECCIÓN ---

    // El resto de las variables de elementos se inicializan después
    let cartCountEl, cartItemsContainer, cartTotalEl, checkoutContainer, paymentStatusEl, cartModalEl, cartModal, dynamicNavLinks, toastEl, toast, toastBodyEl;
    let pdfViewerModalEl, pdfViewerModal, pdfCanvas, pdfCanvasContainer, pageNumEl, pageCountEl, prevPageBtn, nextPageBtn, zoomInBtn, zoomOutBtn;
    let purchasedModalEl, purchasedModal, purchasedProductNameEl;
    let productDetailModalEl, productDetailModal; // Para reseñas
    
    let pdfDoc = null, pageNum = 1, pageIsRendering = false, pageNumIsPending = null, previewPageLimit = 0;
    let currentScale = 1.0; // Zoom inicial

    // --- 1. Inicializar todas las variables del DOM ---
    function initializeDOMElements() {
        cartItemsContainer = document.getElementById('cartItemsContainer');
        cartTotalEl = document.getElementById('cartTotal');
        checkoutContainer = document.getElementById('checkout-container');
        paymentStatusEl = document.getElementById('payment-status');
        cartModalEl = document.getElementById('cartModal');
        cartModal = new bootstrap.Modal(cartModalEl);
        dynamicNavLinks = document.getElementById('dynamic-nav-links');
        
        // --- INICIO DE CORRECCIÓN: Toast genérico ---
        // Asumimos que _toast.html tiene la estructura de un toast de Bootstrap
        toastEl = document.getElementById('liveToast'); 
        if (toastEl) {
            toastBodyEl = toastEl.querySelector('.toast-body'); // Buscamos el body
            toast = new bootstrap.Toast(toastEl);
        }
        // --- FIN DE CORRECCIÓN ---
        
        pdfViewerModalEl = document.getElementById('pdfViewerModal');
        pdfViewerModal = new bootstrap.Modal(pdfViewerModalEl);
        pdfCanvas = document.getElementById('pdf-canvas');
        pdfCanvasContainer = document.getElementById('pdf-canvas-container');
        pageNumEl = document.getElementById('page-num');
        pageCountEl = document.getElementById('page-count');
        prevPageBtn = document.getElementById('prev-page');
        nextPageBtn = document.getElementById('next-page');
        zoomInBtn = document.getElementById('zoom-in');
        zoomOutBtn = document.getElementById('zoom-out');
        
        purchasedModalEl = document.getElementById('alreadyPurchasedModal');
        purchasedModal = new bootstrap.Modal(purchasedModalEl);
        purchasedProductNameEl = document.getElementById('purchased-product-name');

        productDetailModalEl = document.getElementById('productDetailModal');
        productDetailModal = new bootstrap.Modal(productDetailModalEl);
    }

    // --- 2. Definir todas las funciones auxiliares ---

    // --- INICIO DE CORRECCIÓN: Función genérica para Toasts ---
    /**
     * Muestra un toast genérico.
     * @param {string} message - El mensaje a mostrar.
     * @param {string} type - 'success', 'error', o 'info'
     */
    function showAppToast(message, type = 'info') {
        if (!toastEl || !toastBodyEl || !toast) {
            console.log("Toast Fallback:", message); // Fallback si el toast no está listo
            return;
        }
        
        // Cambiamos el contenido del body
        // (Asumimos que el _toast.html tiene un elemento con id 'toast-item-name' y lo ocultamos/mostramos)
        const specificItemEl = document.getElementById('toast-item-name');
        if (specificItemEl) specificItemEl.style.display = 'none'; // Ocultar el específico
        
        toastBodyEl.textContent = message; // Mostrar el mensaje genérico
        
        // Cambiar el color del toast
        toastEl.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'bg-info');
        if (type === 'success') toastEl.classList.add('bg-success');
        else if (type === 'error') toastEl.classList.add('bg-danger');
        else toastEl.classList.add('bg-primary');
        
        toast.show();
    }
    
    // Función para el toast específico de "Agregar al carrito"
    function showItemAddedToast(name) {
        if (!toastEl || !toast) return;
        const specificItemEl = document.getElementById('toast-item-name');
        if (specificItemEl) {
            specificItemEl.textContent = name;
            specificItemEl.style.display = 'block';
        }
        
        const genericBody = toastEl.querySelector('.toast-body');
        if (genericBody) genericBody.textContent = 'agregado al carrito'; // Texto genérico
        
        toastEl.classList.remove('bg-danger', 'bg-primary', 'bg-info');
        toastEl.classList.add('bg-success');
        toast.show();
    }
    // --- FIN DE CORRECCIÓN ---


    // PERSISTENCIA DEL CARRITO (sin cambios)
    const saveCartToStorage = () => { if (currentUserEmail) localStorage.setItem(`cart_${currentUserEmail}`, JSON.stringify(cart)); };
    const loadCartFromStorage = () => {
        if (currentUserEmail) {
            const savedCart = localStorage.getItem(`cart_${currentUserEmail}`);
            if (savedCart) { try { const p = JSON.parse(savedCart); if (Array.isArray(p)) cart = p; } catch (e) { cart = []; } } else { cart = []; }
        } else {
            const tempCart = localStorage.getItem('savedCart');
            if (tempCart) {
                try { const p = JSON.parse(tempCart); if (Array.isArray(p)) cart.push(...p); } catch (e) { console.error("Error al parsear carrito temporal:", e); }
                localStorage.removeItem('savedCart');
            } else { cart = []; }
        }
    };
    
    // FUNCIONES AUXILIARES DE UI (sin cambios)
    const formatMoney = (n) => n.toFixed(2);
    const calculateTotal = () => cart.reduce((total, item) => total + (item.price * item.qty), 0);
    
    const updateCartBadge = () => {
        const currentCartCountEl = document.getElementById('cart-count');
        if (currentCartCountEl) { currentCartCountEl.textContent = cart.reduce((s, it) => s + it.qty, 0); }
    };

    // RENDERIZADO DEL MENÚ DE NAVEGACIÓN (sin cambios)
    function renderNavMenu(sessionData) {
        let staticLinks = `
            <li class="nav-item"><a class="nav-link" href="#inicio">Inicio</a></li>
            <li class="nav-item"><a class="nav-link" href="#planes">Planes</a></li>
            <li class="nav-item"><a class="nav-link" href="#productos">Productos</a></li>
        `;
        const searchBarHtml = `
            <li class="nav-item ms-lg-3 me-lg-2">
                <form class="d-flex nav-search-form" id="productSearchForm" role="search">
                    <i class="bi bi-search"></i>
                    <input class="form-control nav-search-input" type="search" id="navSearchInput" placeholder="Buscar producto..." aria-label="Buscar">
                </form>
            </li>
        `;
        let dynamicLinks = '';
        if (sessionData.loggedIn) {
            currentUserEmail = sessionData.user.email;
            dynamicLinks = `
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
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
        dynamicNavLinks.innerHTML = staticLinks + searchBarHtml + dynamicLinks + cartLink;
        if (sessionData.loggedIn) {
            document.getElementById('logoutBtnNav').addEventListener('click', () => {
                saveCartToStorage();
                fetch('/logout', { method: 'POST' }).then(() => window.location.reload());
            });
        }
        updateCartBadge();
    }
    
    // --- INICIO DE CORRECCIÓN: Nueva función para cargar el script de PayPal ---
    /**
     * Carga el SDK de PayPal dinámicamente con la moneda correcta.
     * @param {string} currency - El código de moneda (ej. 'MXN' o 'USD')
     * @param {Function} onReadyCallback - La función que se ejecutará cuando el script esté listo.
     */
    function loadPayPalScript(currency, onReadyCallback) {
        if (isPayPalScriptLoaded) {
            // Si el script ya se cargó (ej. cerró y abrió el modal),
            // simplemente ejecuta el callback.
            onReadyCallback();
            return;
        }

        // Mostrar un spinner o texto de "Cargando..." en el contenedor de pago
        checkoutContainer.innerHTML = '<p class="text-center text-muted">Cargando método de pago...</p>';

        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=${currency}`;
        script.async = true;
        
        script.onload = () => {
            console.log(`PayPal SDK cargado para ${currency}`);
            isPayPalScriptLoaded = true; // Marcar como cargado
            onReadyCallback(); // Ejecutar la función para renderizar el botón
        };
        
        script.onerror = () => {
            console.error("No se pudo cargar el script de PayPal.");
            checkoutContainer.innerHTML = '<p class="text-center text-danger">Error al cargar el módulo de pago. Por favor, recarga la página.</p>';
        };
        
        document.body.appendChild(script);
    }
    // --- FIN DE CORRECCIÓN ---


    // ==========================================================
    // === RENDERIZADO DE PAYPAL (MODIFICADO) ===
    // ==========================================================
    function renderCheckoutSection(sessionData) {
        checkoutContainer.innerHTML = '';
        paymentStatusEl.innerHTML = '';
        const totalMXN = calculateTotal(); // Total base en MXN
        const totalConverted = totalMXN * conversionRate; // Total en moneda del usuario

        if (totalConverted <= 0) {
            checkoutContainer.innerHTML = '<p class="text-muted text-center">Agrega productos para poder pagar.</p>';
            return;
        }

        if (sessionData.loggedIn) {
            // --- INICIO DE CORRECCIÓN:
            // Esta función AHORA se llama DESPUÉS de que el script de PayPal cargó.
            // Por lo tanto, el objeto 'paypal' SÍ existe.
            paypal.Buttons({
                createOrder: async () => {
                    // Enviar el total CONVERTIDO y la moneda al servidor
                    try {
                        const response = await fetch('/api/orders', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                totalAmount: totalConverted.toFixed(2),
                                currencyCode: userCurrency 
                            })
                        });
                        
                        const orderData = await response.json();
                        if (!response.ok) {
                            // Si el backend da error 500 (ej. "Expected currency...")
                            console.error("Error en /api/orders:", orderData);
                            paymentStatusEl.innerHTML = `<div class="alert alert-danger">Error del servidor: ${orderData.message || 'Conflicto de moneda'}</div>`;
                            return; // Importante
                        }
                        return orderData.id;

                    } catch (error) {
                        console.error("Error al crear la orden:", error);
                        paymentStatusEl.innerHTML = `<div class="alert alert-danger">Error de red al crear la orden.</div>`;
                    }
                },
                onApprove: (data, actions) => {
                    // Usamos el 'capture' del lado del servidor que ya tenías
                    return fetch(`/api/orders/${data.orderID}/capture`, { 
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    })
                    .then(res => res.json())
                    .then(captureData => {
                        // 'captureData' es la respuesta exitosa de PayPal
                        paymentStatusEl.innerHTML = `<div class="alert alert-success">¡Pago completado! Procesando...</div>`;
                    
                        const productNames = cart.map(item => item.name).join(', ');
                        const payerName = captureData.payer.name.given_name + ' ' + captureData.payer.name.surname;
                    
                        const purchaseData = {
                            userEmail: sessionData.user.email,
                            cardName: payerName,
                            paypalTransactionId: captureData.id, // ID de la captura
                            productName: productNames,
                            price: totalMXN.toFixed(2) // Guardar el precio original en MXN
                        };
                    
                        return fetch('/process-purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(purchaseData) });
                    })
                    .then(res => res.json())
                    .then(serverData => {
                        if (serverData.success) {
                            // CORRECCIÓN: Reemplazar alert()
                            showAppToast('¡Gracias por tu compra! Revisa tu correo para el comprobante.', 'success');
                            cart = []; 
                            renderCart();
                            fetch('/my-purchases').then(res => res.json()).then(purchases => userPurchases = purchases);
                            setTimeout(() => cartModal.hide(), 2000);
                        } else { 
                            throw new Error(serverData.message); 
                        }
                    })
                    .catch(err => {
                        console.error("Error en onApprove:", err);
                        paymentStatusEl.innerHTML = `<div class="alert alert-danger">Ocurrió un error al procesar tu compra.</div>`;
                    });
                },
                onError: (err) => { 
                    console.error("Error de PayPal:", err);
                    paymentStatusEl.innerHTML = `<div class="alert alert-danger">Ocurrió un error con el pago.</div>`; 
                }
            }).render(checkoutContainer);
            // --- FIN DE CORRECCIÓN ---
        } else {
            const loginBtn = document.createElement('button');
            loginBtn.className = 'btn btn-accent w-100';
            loginBtn.textContent = 'Iniciar Sesión para Pagar';
            loginBtn.onclick = () => { localStorage.setItem('savedCart', JSON.stringify(cart)); window.location.href = 'login.html'; };
            checkoutContainer.appendChild(loginBtn);
        }
    }

    // EVENTOS DEL CARRITO (sin cambios)
    function addCartEventListeners() {
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                cart[idx].qty = parseInt(e.target.value) || 1;
                renderCart();
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
    
    // RENDERIZADO DEL CARRITO (MODIFICADO)
    function renderCart() {
        if (!cartItemsContainer || !cartTotalEl) return;
        cartItemsContainer.innerHTML = cart.length === 0 ? '<p class="text-muted">Tu carrito está vacío</p>' : '';
        
        let subtotalMXN = 0;
        
        cart.forEach((item, idx) => {
            const itemTotalMXN = item.price * item.qty;
            subtotalMXN += itemTotalMXN;
            const displayPrice = itemTotalMXN * conversionRate; // Convertir para mostrar

            const itemDiv = document.createElement('div');
            itemDiv.className = 'd-flex align-items-center justify-content-between cart-item mb-3';
            itemDiv.innerHTML = `
                <div><strong>${item.name}</strong><div class="text-muted small text-uppercase">${item.type}</div></div>
                <div class="d-flex align-items-center gap-3">
                    <span>$${formatMoney(displayPrice)} ${userCurrency}</span>
                    <input type="number" min="1" value="${item.qty}" class="form-control bg-dark text-white quantity-input" style="width:70px" data-idx="${idx}">
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
    
    // --- LÓGICA DEL VISOR DE PDF Y RESEÑAS ---

    function renderStars(avgRating) {
        let starsHtml = '';
        const rating = Math.round(avgRating * 2) / 2;
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) starsHtml += '<i class="bi bi-star-fill"></i>';
            else if (i - 0.5 === rating) starsHtml += '<i class="bi bi-star-half"></i>';
            else starsHtml += '<i class="bi bi-star"></i>';
        }
        return starsHtml;
    }

    const renderPage = num => {
        pageIsRendering = true;
        const existingWatermark = document.getElementById('watermark');
        if (existingWatermark) existingWatermark.remove();

        if (num > previewPageLimit) {
            const watermark = document.createElement('div');
            watermark.id = 'watermark';
            watermark.className = 'watermark-overlay';
            watermark.innerHTML = `<div class="icon"><i class="bi bi-lock-fill"></i></div><div>PAGA PARA DESBLOQUEAR</div><button class="btn btn-accent mt-3">Comprar ahora</button>`;
            pdfCanvasContainer.appendChild(watermark);
            watermark.querySelector('button').onclick = () => {
                pdfViewerModal.hide();
                const btn = document.querySelector(`.add-to-cart[data-pdf-url$="${pdfDoc.url.split('/').pop()}"]`);
                if(btn) btn.click();
            };
            pdfCanvas.getContext('2d').clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
            pageNumEl.textContent = num;
            pageIsRendering = false;
            return;
        }

        pdfDoc.getPage(num).then(page => {
            const viewport = page.getViewport({ scale: currentScale });
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport }).promise.then(() => {
                pageIsRendering = false;
                if (pageNumIsPending !== null) { renderPage(pageNumIsPending); pageNumIsPending = null; }
            });
        });
        pageNumEl.textContent = num;
    };
    const queueRenderPage = num => { if (pageIsRendering) { pageNumIsPending = num; } else { renderPage(num); } };

    function showAlreadyPurchasedModal(productName) {
        purchasedProductNameEl.textContent = productName;
        purchasedModal.show();
    }

    async function fetchAndRenderReviews(productId) {
        const reviewContainer = document.getElementById('review-list-container');
        reviewContainer.innerHTML = '<p class="text-muted">Cargando reseñas...</p>';
        const response = await fetch(`/api/products/${productId}/reviews`);
        const reviews = await response.json();
        if (reviews.length === 0) {
            reviewContainer.innerHTML = '<p class="text-muted">Este producto aún no tiene reseñas. ¡Sé el primero!</p>';
            return;
        }
        reviewContainer.innerHTML = '';
        reviews.forEach(review => {
            const reviewHtml = `
                <div class="mb-3 p-3" style="background-color: var(--bg); border-radius: 8px;">
                    <div class="d-flex justify-content-between">
                        <strong>${review.user_name}</strong>
                        <span class="star-rating">${renderStars(review.rating)}</span>
                    </div>
                    <p class="text-muted small">${new Date(review.created_at).toLocaleDateString('es-MX')}</p>
                    <p>${review.comment}</p>
                    ${review.image_url ? `<img src="${review.image_url}" class="img-fluid rounded mb-2" alt="Reseña">` : ''}
                    ${review.video_url ? `<video controls class="w-100 rounded mb-2"><source src="${review.video_url}"></video>` : ''}
                </div>
            `;
            reviewContainer.innerHTML += reviewHtml;
        });
    }

    async function handleReviewSubmit(e, productId) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Publicando...';
        try {
            const response = await fetch(`/api/products/${productId}/reviews`, { method: 'POST', body: formData });
            const data = await response.json();
            if (data.success) {
                // CORRECCIÓN: Reemplazar alert()
                showAppToast('¡Gracias por tu reseña!', 'success');
                form.reset();
                await fetchAndRenderReviews(productId);
            } else {
                // CORRECCIÓN: Reemplazar alert()
                showAppToast('Error: ' + data.message, 'error');
            }
        } catch (err) {
            // CORRECCIÓN: Reemplazar alert()
            showAppToast('Error de conexión al publicar la reseña.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Publicar Reseña';
        }
    }

    async function openProductModal(productId) {
    const product = allProducts.find(p => p.id == productId);
    if (!product) return;

    document.getElementById('product-detail-title').textContent = product.name;
    document.getElementById('product-detail-img').src = product.image_url;
    document.getElementById('product-detail-name').textContent = product.name;
    document.getElementById('product-detail-desc').textContent = product.description;

    const price = parseFloat(product.price) || 0;
    // CORRECCIÓN: Mostrar precio convertido en el modal
    const displayPrice = price * conversionRate;
    document.getElementById('product-detail-price').textContent = `$${formatMoney(displayPrice)} ${userCurrency}`;

    document.getElementById('product-detail-stars-avg').innerHTML = renderStars(product.avg_rating);
    document.getElementById('product-detail-review-count').textContent = 
        `(${product.review_count} ${product.review_count === 1 ? 'reseña' : 'reseñas'})`;

    const addBtn = document.getElementById('product-detail-add-btn');
    addBtn.dataset.name = product.name;
    addBtn.dataset.type = product.category;
    addBtn.dataset.price = price; // Guardar siempre el precio base en MXN
    addBtn.dataset.productId = product.id;

    // --- Cargar reseñas ---
    await fetchAndRenderReviews(productId);

    const reviewForm = document.getElementById('reviewForm');

    // --- Mostrar formulario de reseñas (sin cambios) ---
    if (currentUserEmail) {
        const hasPurchased = Array.isArray(userPurchases) && userPurchases.some(purchase => {
            const prodName = purchase.productName || purchase.product_name || '';
            return prodName.includes(product.name) && purchase.status === 'COMPLETADO';
        });

        if (hasPurchased) {
            reviewForm.style.display = 'block';
            reviewForm.onsubmit = (e) => handleReviewSubmit(e, productId);
        } else {
            reviewForm.style.display = 'none';
        }
    } else {
        reviewForm.style.display = 'none';
    }

    productDetailModal.show();
}


    
    // ==========================================================
    // === LÓGICA PARA CARGAR PRODUCTOS (CORREGIDA) ===
    // ==========================================================
    async function loadAllProducts() {
        try {
            const response = await fetch('/api/products');
            products = await response.json();
            allProducts = products;

            const planesContainer = document.getElementById('planes-container');
            const librosContainer = document.getElementById('libros-container');
            const productosContainer = document.getElementById('productos-container-row');
            
            if (!planesContainer || !librosContainer || !productosContainer) { return; }

            planesContainer.innerHTML = '';
            librosContainer.innerHTML = '';
            productosContainer.innerHTML = '';

            products.forEach(p => {
                let productHtml = '';
                const avgRating = p.avg_rating || 0;
                const reviewCount = p.review_count || 0;
                const starsHtml = avgRating > 0 ? renderStars(avgRating) : '<span class="text-muted small">Sin reseñas</span>';
                
                // CORRECCIÓN: Calcular precio convertido para mostrar
                const displayPrice = (p.price || 0) * conversionRate;

                const isPdfProduct = p.pdf_url && p.pdf_url !== 'null';
                const imgClasses = isPdfProduct ? "card-img-top-custom view-pdf-btn" : "card-img-top-custom";
                const imgCursor = isPdfProduct ? "cursor: pointer;" : "";
                const imgData = isPdfProduct ? `data-pdf-url="${p.pdf_url}" data-preview-pages="${p.preview_pages}"` : "";

                const titleClasses = "fw-bold view-product-details";
                const titleCursor = "cursor: pointer;";
                const titleData = `data-product-id="${p.id}"`;
                
                const reviewButton = `
                    <button class="btn btn-outline-light btn-sm view-product-details" data-product-id="${p.id}">
                        <i class="bi bi-star-fill"></i> Reseñas
                    </button>
                `;

                if (p.category === 'plan' || p.category === 'libro') {
                    productHtml = `
                    <div class="col-lg-6" data-aos="fade-up">
                        <div class="card-pro d-flex flex-column">
                            <img class="${imgClasses}" src="${p.image_url}" alt="${p.name}" ${imgData} style="${imgCursor}">
                            <div class="p-4 d-flex flex-column flex-grow-1">
                                <h4 class="mb-1 ${titleClasses}" ${titleData} style="${titleCursor}">${p.name}</h4>
                                <div class="star-rating mb-2 ${titleClasses}" ${titleData} style="${titleCursor}">
                                    ${starsHtml} <span class="text-muted small">(${reviewCount})</span>
                                </div>
                                <p class="text-muted">${p.description}</p>
                                <div class="d-flex justify-content-between align-items-center mt-auto pt-3">
ICAgICAgICAgICAgICAgICAgICAgICAgICAgPD9?-- CORRECCIÓN: Mostrar precio/moneda dinámico --
                                    <div class="price">$${formatMoney(displayPrice)} ${userCurrency}</div>
                                    <button class="btn btn-accent add-to-cart" data-type="${p.category}" data-name="${p.name}" data-price="${p.price}" data-product-id="${p.id}">
                                        <i class="bi bi-cart-plus-fill"></i> Agregar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                    if (p.category === 'plan') planesContainer.innerHTML += productHtml;
                    else librosContainer.innerHTML += productHtml;
                } else {
                    productHtml = `
                    <div class="col-md-4" data-aos="zoom-in">
                        <div class="card-pro d-flex flex-column">
                            <img src="${p.image_url}" class="card-img-top-custom" alt="${p.name}">
                            <div class="p-4 d-flex flex-column flex-grow-1">
                                <h5 class="${titleClasses}" ${titleData} style="${titleCursor}">${p.name}</h5>
                                <div class="star-rating mb-2 ${titleClasses}" ${titleData} style="${titleCursor}">
                                    ${starsHtml} <span class="text-muted small">(${reviewCount})</span>
                                </div>
                                <p class="text-muted mb-3">${p.description}</p>
                                <div class="d-flex justify-content-between align-items-center mt-auto">
                                    <div class="price">$${formatMoney(displayPrice)} ${userCurrency}</div>

                                    <div class="d-flex gap-2">
                                        ${reviewButton}
                                        <button class="btn btn-accent add-to-cart" data-type="Producto" data-name="${p.name}" data-price="${p.price}" data-product-id="${p.id}">Agregar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
                    productosContainer.innerHTML += productHtml;
                }
            });
            return true;
        } catch (error) {
            console.error("Error al cargar productos:", error);
            return false;
        }
    }
    
// ==========================================================
    // === NUEVA FUNCIÓN DE BÚSQUEDA ===
    // ==========================================================
    function performSearch(searchTerm) {
        // Selecciona todas las tarjetas de producto (planes, libros y equipo)
        const products = document.querySelectorAll('.card-pro');
        let productFound = false;

        products.forEach(product => {
            const cardColumn = product.closest('.col-lg-6, .col-md-4'); // Obtener la columna contenedora
            const productName = product.querySelector('h4, h5').textContent.toLowerCase();
            const productDesc = product.querySelector('p').textContent.toLowerCase();
            
            if (productName.includes(searchTerm) || productDesc.includes(searchTerm)) {
                cardColumn.style.display = 'block'; // Mostrar
                productFound = true;
            } else {
                cardColumn.style.display = 'none'; // Ocultar
            }
        });

        // Si el término de búsqueda está vacío, mostrar todo de nuevo
        if (searchTerm === "") {
            products.forEach(product => {
                product.closest('.col-lg-6, .col-md-4').style.display = 'block';
            });
        }

        // Opcional: si se busca algo y se encuentra, hacer scroll a la sección
        if (searchTerm.length > 0 && productFound) {
            document.getElementById('planes').scrollIntoView({ behavior: 'smooth' });
  D:/Programacion/MagnumFitness/components/_toast.html  }
    }
    
    // --- 3. ASIGNACIÓN DE TODOS LOS EVENTOS DE LA PÁGINA ---
    function initializeEventListeners() {
        
       // Evento para agregar productos
document.querySelectorAll('.add-to-cart, .add-to-cart-from-modal').forEach(button => {
    button.addEventListener('click', (e) => {
        e.stopPropagation(); 
        const name = button.dataset.name;
        const type = button.dataset.type;
        const price = parseFloat(button.dataset.price); // Precio en MXN

        fetch('/check-session')
            .then(res => res.json())
            .then(sessionData => {
                if (sessionData.loggedIn) {
                    const alreadyPurchased = userPurchases.some(purchase => {
                        // Evitar errores si productName es undefined o si el backend usa otro formato
                        const productName = purchase.productName || purchase.product_name || '';
                        return productName.includes(name) && purchase.status === 'COMPLETADO';
                    });

                    if (alreadyPurchased) {
                        showAlreadyPurchasedModal(name);
                        return;
                    }

                    const existingItem = cart.find(item => item.name === name);
                    if (existingItem) {
                        existingItem.qty++;
                    } else {
                        cart.push({ name, type, price, qty: 1 }); // Siempre guardar precio base MXN
                    }

                    renderCart();
                    // CORRECCIÓN: Llamar a la función de toast específica
                    showItemAddedToast(name);
                    cartModal.show();
                } else {
                    // CORRECCIÓN: Reemplazar alert()
                    showAppToast('Debes iniciar sesión para agregar productos.', 'info');
                    localStorage.setItem('savedCart', JSON.stringify([{ name, type, price, qty: 1 }]));
                    // Esperar un poco a que se muestre el toast antes de redirigir
                    setTimeout(() => window.location.href = 'login.html', 2000);
                }
            })
            .catch(err => console.error('Error verificando sesión o agregando producto:', err));
    });
});


        // Evento para ver PDFs de MUESTRA
        document.querySelectorAll('.view-pdf-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.pdfUrl;
                if (!url || url === 'null') return;
                
                previewPageLimit = parseInt(btn.dataset.previewPages, 10);
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;
                pdfjsLib.getDocument(url).promise.then(pdfDoc_ => {
                    pdfDoc = pdfDoc_;
                    pageCountEl.textContent = pdfDoc.numPages;
                    pageNum = 1;
                    currentScale = 1.0;
                    renderPage(pageNum);
                    pdfViewerModal.show();
                }).catch(err => {
                    // CORRECCIÓN: Reemplazar alert()
                    console.error("Error al cargar PDF:", err);
                    showAppToast('No se pudo cargar la vista previa.', 'error');
                });
            });
        });

        // Evento para ver DETALLES DEL PRODUCTO (reseñas)
        document.querySelectorAll('.view-product-details').forEach(element => {
            element.addEventListener('click', (e) => {
                if (e.target.closest('button')) return; 
                const productId = e.currentTarget.dataset.productId;
                openProductModal(productId);
            });
        });
        
        // Eventos de botones del visor de PDF
        prevPageBtn.addEventListener('click', () => { if (pageNum > 1) { pageNum--; queueRenderPage(pageNum); } });
        nextPageBtn.addEventListener('click', () => { if (pageNum < pdfDoc.numPages) { pageNum++; queueRenderPage(pageNum); } });
        zoomInBtn.addEventListener('click', () => { if (currentScale < 3.0) { currentScale += 0.25; renderPage(pageNum); } });
        zoomOutBtn.addEventListener('click', () => { if (currentScale > 0.5) { currentScale -= 0.25; renderPage(pageNum); } });
        
        // Asignar eventos al carrito
        addCartEventListeners();

        // Eventos del Buscador
        const searchForm = document.getElementById('productSearchForm');
        const searchInput = document.getElementById('navSearchInput');
        if(searchForm) {
            searchForm.addEventListener('submit', (e) => {
D:/Programacion/MagnumFitness/components/_navbar.html
                e.preventDefault();
                const searchTerm = searchInput.value.toLowerCase().trim();
                performSearch(searchTerm);
            });
            searchInput.addEventListener('keyup', (e) => {
D:/Programacion/MagnumFitness/components/_cart-modal.html
                 const searchTerm = e.target.value.toLowerCase().trim();
                 performSearch(searchTerm);
            });
        }
    }
    
    // ==========================================================
    // === 4. INICIALIZACIÓN DE LA PÁGINA (MODIFICADA) ===
    // ==========================================================
    initializeDOMElements();
    
    // --- NUEVO FLUJO DE INICIO ---
    async function startPage() {
        try {
            // 1. Obtener la sesión Y la moneda del usuario al mismo tiempo
            const [sessionResponse, locationResponse] = await Promise.all([
                fetch('/check-session'),
                fetch('/api/location-currency')
            ]);
            
            const sessionData = await sessionResponse.json();
D:/Programacion/MagnumFitness/components/_product-detail-modal.html
            const locationData = await locationResponse.json();

            // 2. Configurar la moneda y tasa de cambio
            userCurrency = locationData.currencyCode || 'MXN';
            conversionRate = locationData.conversionRate || 1;
D:/Programacion/MagnumFitness/assets/js/main.js
            
            // 3. Renderizar el menú
            renderNavMenu(sessionData);
            
            // 4. Cargar el carrito (sabiendo quién es el usuario)
D:/Programacion/MagnumFitness/assets/css/main.css
            loadCartFromStorage();
            
            // 5. Cargar historial de compras (si está logueado)
            if (sessionData.loggedIn) {
                try {
                    const purchasesRes = await fetch('/my-purchases');
D:/Programacion/MagnumFitness/components/_pdf-viewer-modal.html
                    userPurchases = await purchasesRes.json();
                } catch (e) { userPurchases = []; }
            }
            
            // 6. Cargar carrito temporal (si viene de un login)
            const tempCart = localStorage.getItem('savedCart');
            if(tempCart) {
                try {
                    const parsedCart = JSON.parse(tempCart);
                    if(Array.isArray(parsedCart) && parsedCart.length > 0) {
                        parsedCart.forEach(tempItem => {
                            const existingItem = cart.find(item => item.name === tempItem.name);
                            if (existingItem) { existingItem.qty += tempItem.qty; }
                            else { cart.push(tempItem); }
                        });
                        cartModal.show();
              }
                } catch(e) { console.error("Error parsing temp cart", e); }
                localStorage.removeItem('savedCart');
            }
            
            // 7. Cargar productos (ahora que ya tenemos la tasa de cambio)
            await loadAllProducts();
            
            // 8. Renderizar el carrito (con precios convertidos)
D:/Programacion/MagnumFitness/components/_already-purchased-modal.html
            renderCart();
            
            // 9. Asignar todos los eventos
D:/Programacion/MagnumFitness/components/_footer.html
            initializeEventListeners();

        } catch (error) {
            console.error("Error al inicializar la página:", error);
            document.body.innerHTML = '<h2 style="color:white; text-align:center; margin-top:50px;">Error al cargar el sitio. Intenta de nuevo más tarde.</h2>';
        }
    }
    
s   // Iniciar la página
    startPage();

    // --- INICIO DE CORRECCIÓN: Evento del modal del carrito MODIFICADO ---
ci     // Ahora, este evento cargará el script de PayPal dinámicamente
    cartModalEl.addEventListener('shown.bs.modal', () => {
        fetch('/check-session')
            .then(res => res.json())
            .then(sessionData => {
                // 1. Cargar el script de PayPal con la moneda global (ej. 'USD')
                loadPayPalScript(userCurrency, () => {
                    // 2. Una vez cargado, renderizar los botones
                     renderCheckoutSection(sessionData);
                });
            });
    });
    // --- FIN DE CORRECCIÓN ---
    
}