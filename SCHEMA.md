# Modelo de datos

## usuarios/{uid}

```js
{
  nombre: "Jeff",
  nombreNormalizado: "jeff",
  rol: "admin" | "vendedor" | "comprador",
  activo: true,
  clienteId: "uid-o-id-cliente", // solo comprador
  creadoEn: Timestamp
}
```

## clientes/{clienteId}

```js
{
  nombre: "Alejandra",
  nombreNormalizado: "alejandra",
  tipo: "registrado" | "ocasional",
  uid: "firebase-auth-uid" | null,
  activo: true,
  creadoEn: Timestamp
}
```

Los saldos no se escriben manualmente: se calculan desde pedidos válidos menos pagos confirmados.

## menus/{YYYY-MM-DD}

Un documento por día facilita mostrar automáticamente el menú correcto.

```js
{
  fecha: "2026-08-07",
  semanaId: "2026-W32",
  activo: true,
  opciones: [
    { id: "papi-pollo", nombre: "Papi Pollo", descripcion: "", precio: 3.50, disponible: true }
  ],
  actualizadoEn: Timestamp
}
```

## pedidos/{pedidoId}

```js
{
  clienteId: "...",
  compradorUid: "..." | null,
  compradorNombre: "Jeff",
  fecha: "2026-08-07",
  items: [
    { productoId: "papi-pollo", nombre: "Papi Pollo", cantidad: 2, precioUnitario: 3.50, subtotal: 7.00 }
  ],
  total: 7.00,
  estado: "confirmado" | "cancelado",
  origen: "comprador" | "vendedor" | "whatsapp" | "telefono" | "presencial",
  creadoPor: "uid",
  creadoEn: Timestamp,
  canceladoEn: Timestamp | null
}
```

Un pedido confirmado suma al consumo automáticamente. Un pedido cancelado no suma al saldo.

## pagos/{pagoId}

```js
{
  clienteId: "...",
  clienteUid: "..." | null,
  clienteNombre: "Jeff",
  monto: 10.00,
  metodo: "efectivo" | "transferencia",
  estado: "confirmado" | "anulado",
  comprobanteId: "..." | null,
  registradoPor: "uid",
  creadoEn: Timestamp
}
```

## comprobantes/{comprobanteId}

```js
{
  clienteId: "...",
  clienteUid: "...",
  clienteNombre: "Jeff",
  montoDeclarado: 10.00,
  r2Key: "comprobantes/...",
  archivoNombre: "transferencia.jpg",
  estado: "pendiente" | "aprobado" | "rechazado",
  creadoEn: Timestamp,
  revisadoEn: Timestamp | null,
  revisadoPor: "uid" | null
}
```

Al aprobar un comprobante, vendedor o administrador registra el pago correspondiente.

## auditoria/{id}

```js
{
  tipo: "pedido" | "pago" | "menu" | "cliente" | "comprobante",
  entidadId: "...",
  accion: "crear" | "editar" | "cancelar" | "anular" | "aprobar" | "rechazar",
  usuarioUid: "...",
  usuarioNombre: "...",
  detalle: {},
  creadoEn: Timestamp
}
```
