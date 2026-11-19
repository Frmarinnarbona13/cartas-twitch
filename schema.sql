-- =====================================================================
--  Extensión de cartas para Twitch — Esquema inicial de Supabase
--  Ya aplicado en el proyecto cartas-twitch (migración esquema_inicial_cartas)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. USUARIOS (espectadores que han usado la extensión)
-- ---------------------------------------------------------------------
create table usuarios (
  twitch_id  text primary key,              -- ID real de Twitch (requiere "compartir identidad")
  nombre     text,                          -- nombre visible en Twitch
  creado_en  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. CARTAS (catálogo que creas tú desde el panel de admin)
-- ---------------------------------------------------------------------
create table cartas (
  id               bigint generated always as identity primary key,
  nombre           text not null,
  descripcion      text,
  imagen_url       text not null,            -- URL de GitHub Pages
  rareza           text not null
                   check (rareza in ('comun', 'rara', 'epica', 'legendaria', 'divina')),
  limite_copias    int                       -- NULL = sin límite; 100 = edición limitada de 100
                   check (limite_copias is null or limite_copias > 0),
  copias_emitidas  int not null default 0,   -- cuántas copias existen ya
  activa           boolean not null default true,  -- desactivar = deja de salir en sobres
  creada_en        timestamptz not null default now(),
  check (limite_copias is null or copias_emitidas <= limite_copias)
);


-- ---------------------------------------------------------------------
-- 3. TIPOS DE SOBRE (normal, premium, evento... cada uno con sus %)
-- ---------------------------------------------------------------------
create table tipos_sobre (
  id                bigint generated always as identity primary key,
  nombre            text not null,
  imagen_url        text,
  cartas_por_sobre  int not null default 5,
  probabilidades    jsonb not null,          -- ej: {"comun":60,"rara":25,"epica":10,"legendaria":4,"divina":1}
  activo            boolean not null default true
);


-- ---------------------------------------------------------------------
-- 4. SOBRES (cada sobre que tiene un usuario, abierto o no)
--
--    Estados:
--      pendiente -> lo tiene pero no lo ha abierto
--      sorteado  -> ha pulsado "abrir": ya están decididas las 5 cartas,
--                   pero aún no ha elegido (el frontend NO las conoce)
--      abierto   -> ha elegido; se queda solo con la carta elegida
-- ---------------------------------------------------------------------
create table sobres (
  id                bigint generated always as identity primary key,
  usuario_id        text not null references usuarios(twitch_id),
  tipo_sobre_id     bigint not null references tipos_sobre(id),
  origen            text not null
                    check (origen in ('regalo', 'drop_aleatorio', 'canje_puntos')),
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'sorteado', 'abierto')),
  cartas_sorteadas  bigint[],                -- IDs de las 5 cartas, en orden de posición
  posicion_elegida  int,                     -- 1..5
  creado_en         timestamptz not null default now(),
  abierto_en        timestamptz
);
create index on sobres (usuario_id, estado);
create index on sobres (tipo_sobre_id);


-- ---------------------------------------------------------------------
-- 5. COPIAS (el inventario: UNA FILA POR CADA COPIA DE CARTA)
--    Así cada copia tiene su número de serie (#37/100) y en el futuro
--    un tradeo será simplemente cambiar el usuario_id de la copia.
-- ---------------------------------------------------------------------
create table copias (
  id            bigint generated always as identity primary key,
  carta_id      bigint not null references cartas(id),
  usuario_id    text not null references usuarios(twitch_id),
  numero_serie  int not null,
  sobre_id      bigint references sobres(id),   -- NULL si vino de un drop de carta
  origen        text not null check (origen in ('sobre', 'drop_carta')),
  obtenida_en   timestamptz not null default now(),
  unique (carta_id, numero_serie)
);
create index on copias (usuario_id);
create index on copias (sobre_id);


-- ---------------------------------------------------------------------
-- 6. VISTA DE STOCK (para tu panel: "37 / 100 emitidas")
-- ---------------------------------------------------------------------
create view stock_cartas with (security_invoker = true) as
select
  id,
  nombre,
  rareza,
  copias_emitidas,
  limite_copias,
  case when limite_copias is null then null
       else limite_copias - copias_emitidas end as restantes
from cartas;


-- ---------------------------------------------------------------------
-- 7. FUNCIÓN: emitir_copia
--    Crea una copia de una carta para un usuario, de forma segura:
--    bloquea la carta para que dos personas no se lleven el mismo
--    número de serie a la vez. Devuelve NULL si no hay stock.
--    Se usa tanto al abrir sobres como en los drops de cartas.
-- ---------------------------------------------------------------------
create or replace function emitir_copia(
  p_carta_id   bigint,
  p_usuario_id text,
  p_sobre_id   bigint,
  p_origen     text
) returns copias
language plpgsql
set search_path = public
as $$
declare
  v_carta cartas;
  v_copia copias;
begin
  select * into v_carta from cartas where id = p_carta_id for update;

  if v_carta.id is null or not v_carta.activa then
    return null;
  end if;

  if v_carta.limite_copias is not null
     and v_carta.copias_emitidas >= v_carta.limite_copias then
    return null;
  end if;

  update cartas
     set copias_emitidas = copias_emitidas + 1
   where id = p_carta_id;

  insert into copias (carta_id, usuario_id, numero_serie, sobre_id, origen)
  values (p_carta_id, p_usuario_id, v_carta.copias_emitidas + 1, p_sobre_id, p_origen)
  returning * into v_copia;

  return v_copia;
end $$;


-- ---------------------------------------------------------------------
-- 8. FUNCIÓN: elegir_carta
--    Se llama cuando el usuario elige una de las 5 cartas boca abajo.
--    Solo la elegida se convierte en copia (las otras 4 NO gastan
--    stock de ediciones limitadas). Si justo se agotó, le da otra
--    de la misma rareza.
-- ---------------------------------------------------------------------
create or replace function elegir_carta(
  p_sobre_id   bigint,
  p_usuario_id text,
  p_posicion   int
) returns copias
language plpgsql
set search_path = public
as $$
declare
  v_sobre   sobres;
  v_carta_id bigint;
  v_rareza  text;
  v_copia   copias;
begin
  select * into v_sobre from sobres where id = p_sobre_id for update;

  if v_sobre.id is null
     or v_sobre.usuario_id <> p_usuario_id
     or v_sobre.estado <> 'sorteado' then
    raise exception 'SOBRE_NO_VALIDO';
  end if;

  if p_posicion < 1 or p_posicion > array_length(v_sobre.cartas_sorteadas, 1) then
    raise exception 'POSICION_NO_VALIDA';
  end if;

  v_carta_id := v_sobre.cartas_sorteadas[p_posicion];
  v_copia := emitir_copia(v_carta_id, p_usuario_id, p_sobre_id, 'sobre');

  -- Caso raro: la carta limitada se agotó entre el sorteo y la elección
  if v_copia.id is null then
    select rareza into v_rareza from cartas where id = v_carta_id;

    select id into v_carta_id
      from cartas
     where rareza = v_rareza
       and activa
       and (limite_copias is null or copias_emitidas < limite_copias)
     order by random()
     limit 1;

    v_copia := emitir_copia(v_carta_id, p_usuario_id, p_sobre_id, 'sobre');
    v_sobre.cartas_sorteadas[p_posicion] := v_carta_id;
  end if;

  if v_copia.id is null then
    raise exception 'SIN_CARTAS_DISPONIBLES';
  end if;

  update sobres
     set estado           = 'abierto',
         posicion_elegida = p_posicion,
         cartas_sorteadas = v_sobre.cartas_sorteadas,
         abierto_en       = now()
   where id = p_sobre_id;

  return v_copia;
end $$;


-- ---------------------------------------------------------------------
-- 9. SEGURIDAD
--    RLS activado sin políticas = nadie puede leer/escribir con la
--    clave pública. Solo tu backend (con la clave service_role) entra.
-- ---------------------------------------------------------------------
alter table usuarios     enable row level security;
alter table cartas       enable row level security;
alter table tipos_sobre  enable row level security;
alter table sobres       enable row level security;
alter table copias       enable row level security;

revoke execute on function emitir_copia(bigint, text, bigint, text) from public, anon, authenticated;
revoke execute on function elegir_carta(bigint, text, int)          from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 10. DATOS INICIALES
-- ---------------------------------------------------------------------
insert into tipos_sobre (nombre, probabilidades) values
  ('Sobre normal', '{"comun":60,"rara":25,"epica":10,"legendaria":4,"divina":1}');
