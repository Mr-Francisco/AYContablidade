# Guia de UI/UX Premium

## Filosofia de Design
Interface enterprise moderna, com layout editorial forte, tipografia refinada, espaçamento generoso e interações elegantes. Todo o design deve ser referenciado a partir do estilo base em `Piloto/assets/css/style.css`.

## Regras de Implementação

### Componentes
- **Base:** Radix UI para interatividade. Componentes personalizados são permitidos apenas na ausência de um equivalente em Radix.
- **Estilização:** Tailwind CSS com `cn()` para composição de classes. Proibido o uso de estilos inline.

### Animações (Framer Motion)
- **Entrada:** Revelações ao fazer scroll, efeito stagger em cards e KPIs.
- **Micro-interações:** Transições suaves e discretas.
- **Performance:** Animar apenas `transform` e `opacity`. Respeitar `prefers-reduced-motion`.

### Dados e Mapas
- **Gráficos:** Usar Recharts para dashboards.
- **Mapas:** Usar Leaflet se necessário.

### Verificação Obrigatória
Após cada alteração de UI:
- Inspecionar no browser e corrigir erros de consola.
- Verificar e corrigir problemas de overflow.
- Validar responsividade em desktop, tablet e mobile.