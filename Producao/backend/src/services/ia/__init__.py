"""Módulo de Inteligência Artificial.

Arquitectura em três camadas, por ordem de confiança:

  `diagnostico`  — detecção de erros por regras. 100% local, determinístico.
                   Nunca sai nada da máquina.
  `contexto`     — consulta a base, agrega e resume. Local. É aqui que se decide
                   o que é relevante para a pergunta.
  `redaccao`     — a fronteira. Pseudonimiza entidades e remove identificadores.
  `qa`           — o único ponto que fala com a API externa.

A IA nunca vê a base de dados, não executa SQL e não altera nada.
"""

from src.services.ia import contexto, diagnostico, qa, redaccao

__all__ = ["contexto", "diagnostico", "qa", "redaccao"]
