# Pimentón Rojo — control de almuerzos

Monorepo con tres aplicaciones web independientes para controlar **pedidos y pagos**.

## Apps

- `apps/administrador`: administración, menú semanal, clientes, pedidos, pagos, saldos y reportes.
- `apps/vendedor`: operación diaria, pedidos, clientes y registro de pagos.
- `apps/comprador`: ingreso con nombre + PIN, menú del día, pedidos, cuenta, historial y comprobantes.

Las tres apps usan el mismo proyecto Firebase `almacen-65966` y se pueden publicar como tres proyectos separados de Cloudflare Pages.

## Lógica principal

- El comprador puede pedir uno o varios almuerzos en un mismo pedido.
- Al confirmar el pedido, el valor entra automáticamente a su consumo.
- Un pedido cancelado deja de formar parte del saldo.
- Un pago puede cubrir uno, varios o parte de los almuerzos.
- Métodos de pago: efectivo y transferencia.
- Las transferencias pueden incluir comprobante.
- Existen clientes registrados y clientes ocasionales.
- Solo hay un rol vendedor, aunque la estructura permite ampliarlo.

## Firebase

Antes de usar las apps:

1. Activar Authentication > Email/Password.
2. Crear Cloud Firestore.
3. Publicar las reglas de `firestore.rules`.
4. Crear el primer usuario administrador manualmente en Firebase Authentication.
5. Crear `usuarios/{uid}` con `{ nombre, rol: "admin", activo: true }` para ese usuario.

El acceso visible es **Nombre + PIN**. Internamente se transforma el nombre en un correo técnico y el PIN funciona como contraseña de Firebase. Por seguridad y compatibilidad con Firebase, el PIN debe tener 6 dígitos.

## Cloudflare Pages

Crear tres proyectos de Pages apuntando al mismo repositorio:

| Proyecto | Root directory | Build command | Output |
|---|---|---|---|
| Pimentón Admin | `apps/administrador` | Ninguno | `.` |
| Pimentón Vendedor | `apps/vendedor` | Ninguno | `.` |
| Pimentón Comprador | `apps/comprador` | Ninguno | `.` |

Para comprobantes se utilizará Cloudflare R2 dentro de su cuota gratuita. Vincular el mismo bucket con el nombre de binding `COMPROBANTES` en las tres apps de Pages.

## Base de datos

Colecciones principales:

- `usuarios`
- `clientes`
- `menus`
- `pedidos`
- `pagos`
- `comprobantes`
- `auditoria`

Ver `SCHEMA.md` para el detalle.
