// =====================================================================
// Animación de apertura de sobre (la usan el espectador y el simulador)
//
//   reproducirApertura(contenedor, {
//     tipo:           { nombre, imagen_url }            // aspecto del sobre
//     preparar:       async () => ({ cantidad })          // el servidor sortea
//     elegir:         async (posicion) => ({ cartas, posicion_elegida, copia })
//     esPrimera:      (carta) => boolean                  // ¿primera copia? (opcional)
//     botones:        [{ texto, valor, primario }]        // botones al final
//   }) → Promise<valor del botón pulsado | null si se cerró>
// =====================================================================

function reproducirApertura(contenedor, opciones) {
  return new Promise((resolver) => {
    const capa = crear('div', 'apertura');
    const cerrarBtn = crear('button', 'btn redondo fantasma ap-cerrar');
    cerrarBtn.title = 'Cerrar';
    cerrarBtn.appendChild(icono('cerrar'));
    const escena = crear('div', 'ap-escena');
    capa.append(cerrarBtn, escena);
    contenedor.appendChild(capa);

    let terminado = false;
    const terminar = (valor) => {
      if (terminado) return;
      terminado = true;
      capa.remove();
      resolver(valor);
    };
    cerrarBtn.addEventListener('click', () => terminar(null));

    ejecutar().catch((e) => {
      console.error(e);
      avisar(e.message || 'Algo ha fallado al abrir el sobre', true);
      terminar(null);
    });

    async function ejecutar() {
      // ---------- 1) El sobre ----------
      const zonaSobre = crear('div', 'ap-sobre flotando');
      zonaSobre.appendChild(elementoPack(opciones.tipo));
      zonaSobre.appendChild(crear('div', 'destello'));
      const texto = crear('div', 'ap-texto degradado-texto latido', 'Toca el sobre para abrirlo');
      escena.append(zonaSobre, texto);

      await new Promise((ok) => zonaSobre.addEventListener('click', ok, { once: true }));
      zonaSobre.classList.replace('flotando', 'temblando');
      Sonido.play('temblor');
      texto.textContent = 'Abriendo…';

      const [datos] = await Promise.all([opciones.preparar(), esperar(1100)]);

      zonaSobre.classList.replace('temblando', 'rasgando');
      Sonido.play('rasgar');
      texto.classList.add('oculto');
      await esperar(650);
      flash('rgba(255,255,255,.9)');
      escena.innerHTML = '';

      // ---------- 2) Cartas boca abajo ----------
      const titulo = crear('h2', 'ap-titulo', 'Elige tu carta');
      const fila = crear('div', 'ap-cartas');
      const resultado = crear('div', 'ap-resultado oculto');
      escena.append(titulo);
      if (datos.garantizado) escena.appendChild(crear('div', 'ap-texto degradado-texto', '✨ Sobre garantizado: todas épicas o mejores'));
      escena.append(fila, resultado);

      const n = datos.cantidad;
      const ancho = escena.clientWidth || contenedor.clientWidth || 320;
      const porFila = ancho < 420 ? Math.min(n, 3) : Math.min(n, ancho < 640 ? 3 : 4);
      const disponible = Math.min(ancho - 8, 760);
      const anchoCarta = Math.floor(Math.min(150, (disponible - 12 * (porFila - 1)) / porFila));
      fila.style.setProperty('--ancho', anchoCarta + 'px');

      const huecos = [];
      for (let i = 0; i < n; i++) {
        const hueco = crear('div', 'ap-hueco');
        const giro = crear('div', 'ap-giro');
        const trasera = crear('div', 'ap-cara trasera');
        trasera.appendChild(elementoReverso());
        giro.appendChild(trasera);
        hueco.appendChild(giro);
        fila.appendChild(hueco);
        huecos.push(hueco);
      }
      for (const h of huecos) {
        await esperar(90);
        h.classList.add('visible');
        Sonido.play('carta');
      }
      fila.classList.add('eligiendo');

      const posicion = await new Promise((ok) => {
        huecos.forEach((h, i) => h.addEventListener('click', () => ok(i + 1), { once: true }));
      });
      fila.classList.remove('eligiendo');
      Sonido.play('click');
      cerrarBtn.classList.add('oculto'); // ya no se puede cerrar a medias
      const elegido = huecos[posicion - 1];
      elegido.classList.add('elegida');
      titulo.textContent = '…';

      const eleccion = await opciones.elegir(posicion);

      eleccion.cartas.forEach((carta, i) => {
        const frente = crear('div', 'ap-cara frente');
        frente.appendChild(elementoCarta(carta));
        huecos[i].querySelector('.ap-giro').appendChild(frente);
      });

      // ---------- 3) Revelar las que NO elegiste, en orden ----------
      titulo.textContent = 'Las que dejas atrás…';
      for (let i = 0; i < huecos.length; i++) {
        if (i === posicion - 1) continue;
        huecos[i].classList.add('revelada');
        Sonido.play('girar');
        await esperar(420);
        huecos[i].classList.add('descartada');
      }

      // ---------- 4) Redoble y tu carta ----------
      titulo.textContent = 'Y tu carta es…';
      await esperar(250);
      elegido.classList.add('redoble');
      Sonido.play('redoble');
      await esperar(1000);
      elegido.classList.remove('redoble', 'elegida');
      elegido.classList.add('revelada', 'ganadora');

      const carta = eleccion.cartas[posicion - 1];
      const colores = { comun: '#d4d6dd', rara: '#4f9dff', epica: '#b061ff', legendaria: '#f7b928', divina: '#ffffff' };
      flash(colores[carta.rareza] || '#fff');
      Sonido.play('revelar', carta.rareza);
      if (carta.rareza === 'legendaria' || carta.rareza === 'divina' || carta.rareza === 'epica') {
        particulas(elegido, carta.rareza === 'divina' ? 60 : carta.rareza === 'legendaria' ? 40 : 22);
      }
      titulo.textContent = 'Tu tirada';
      await esperar(700);

      // ---------- 5) Resultado ----------
      resultado.innerHTML = '';
      resultado.appendChild(crear('h3', null, carta.nombre));
      const fila2 = crear('div');
      fila2.appendChild(crear('span', 'etiqueta-rareza r-' + carta.rareza, textoRareza(carta.rareza)));
      resultado.appendChild(fila2);
      if (carta.limite_copias && eleccion.copia?.numero_serie) {
        resultado.appendChild(crear('div', 'antetitulo', `Edición limitada · copia #${eleccion.copia.numero_serie} de ${carta.limite_copias}`));
      }
      if (opciones.esPrimera?.(carta)) resultado.appendChild(crear('div', 'antetitulo degradado-texto', '¡Nueva en tu colección!'));

      const botones = crear('div', 'botones');
      for (const b of opciones.botones || [{ texto: 'Continuar', valor: 'continuar', primario: true }]) {
        const btn = crear('button', 'btn' + (b.primario ? ' primario' : ''), b.texto);
        btn.addEventListener('click', () => terminar(b.valor));
        botones.appendChild(btn);
      }
      resultado.appendChild(botones);
      resultado.classList.remove('oculto');
      cerrarBtn.classList.remove('oculto');
    }

    function flash(color) {
      const f = crear('div', 'ap-flash');
      f.style.background = `radial-gradient(circle at 50% 45%, ${color}, transparent 70%)`;
      capa.appendChild(f);
      setTimeout(() => f.remove(), 950);
    }

    function particulas(origen, cantidad) {
      const caja = capa.getBoundingClientRect();
      const r = origen.getBoundingClientRect();
      const cx = r.left - caja.left + r.width / 2;
      const cy = r.top - caja.top + r.height / 2 + capa.scrollTop;
      const paleta = ['#ffd23f', '#ff6ad5', '#6affc3', '#6ab8ff', '#c26aff', '#ffffff'];
      for (let i = 0; i < cantidad; i++) {
        const p = crear('div', 'particula');
        const ang = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 160;
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        p.style.background = paleta[i % paleta.length];
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        p.style.setProperty('--rot', Math.random() * 720 + 'deg');
        capa.appendChild(p);
        setTimeout(() => p.remove(), 1500);
      }
    }
  });
}
