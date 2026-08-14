"""Repõe o acesso a uma conta de demonstração — SÓ EM DESENVOLVIMENTO.

Existe porque uma palavra-passe de teste perdida bloqueia o trabalho e a
alternativa é mexer à mão na base de dados, que é pior. Repõe a palavra-passe
para a documentada em `COMO_TESTAR.md` e volta a mostrar o QR do segundo
factor.

NÃO TOCA NO SEGREDO DO SEGUNDO FACTOR, e é o ponto mais importante deste
script. O QR que mostra é o do segredo QUE JÁ LÁ ESTÁ: a entrada que já existe
na aplicação autenticadora continua a servir, e quem não a tiver pode voltar a
lê-la. Regerar o segredo invalidaria o telemóvel de quem o configurou — foi
por pouco que isso não aconteceu numa sessão anterior, e é o género de ajuda
que dá mais trabalho do que o problema.

Recusa-se a correr com `AMBIENTE=producao`. Repor palavras-passe conhecidas
numa instalação real é a porta aberta mais larga que se pode deixar.

    python scripts/repor_acesso_demo.py                 # admin@demo.ao
    python scripts/repor_acesso_demo.py outro@demo.ao
    python scripts/repor_acesso_demo.py --sem-2fa       # desliga o 2FA também
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

PASSWORD = "demo12345"
POR_OMISSAO = "admin@demo.ao"


def _recusar_em_producao() -> None:
    from src.core.config import get_settings

    if get_settings().AMBIENTE == "producao":
        sys.exit(
            "RECUSADO: este script repõe uma palavra-passe conhecida e o "
            "AMBIENTE é «producao».\n"
            "Numa instalação real, a reposição faz-se pelo administrador da "
            "empresa em Gestão → Utilizadores."
        )


def main(email: str, desligar_2fa: bool = False) -> None:
    _recusar_em_producao()

    from sqlalchemy import select

    from src.auth.security import hash_password
    from src.auth.totp import decifrar_segredo, qr_svg, uri_otpauth
    from src.db.base import SessionLocal
    from src.db.models.user import User

    db = SessionLocal()
    try:
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            sys.exit(f"Não existe nenhuma conta com o e-mail {email}.")

        u.password_hash = hash_password(PASSWORD)
        u.password_provisoria = False
        u.ativo = True
        u.aprovado = True
        # Termina as sessões abertas: uma palavra-passe reposta com a sessão
        # antiga ainda válida não repõe controlo nenhum.
        u.token_version = (u.token_version or 0) + 1

        segredo = None
        if desligar_2fa:
            u.totp_ativo = False
            u.totp_segredo = None
            u.totp_codigos_recuperacao = []
            u.totp_falhas = 0
            u.totp_bloqueado_ate = None
        elif u.totp_ativo and u.totp_segredo:
            # Só para desenhar o QR. O segredo NÃO muda.
            segredo = decifrar_segredo(u.totp_segredo)

        db.commit()

        print()
        print("=" * 66)
        print(f"  Conta        : {u.nome} <{u.email}>")
        print(f"  Perfil       : {u.perfil}")
        print(f"  Palavra-passe: {PASSWORD}")
        print(f"  Empresa      : {u.empresa_id or '(conta de plataforma)'}")
        print("=" * 66)

        if desligar_2fa:
            print("  Segundo factor DESLIGADO. Entra só com a palavra-passe.")
        elif segredo:
            print("  Segundo factor: continua ligado, COM O MESMO SEGREDO.")
            print("  A entrada que já tens na aplicação autenticadora serve.")
            print()
            print(f"  Chave manual : {segredo}")
            caminho = Path(__file__).resolve().parents[1] / "qr_2fa.svg"
            caminho.write_text(
                qr_svg(uri_otpauth(segredo, u.email)), encoding="utf-8"
            )
            print(f"  QR gravado em: {caminho}")
        else:
            print("  Sem segundo factor configurado.")
        print()
        print("  As sessões abertas desta conta foram terminadas.")
        print()
    finally:
        db.close()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0] if args else POR_OMISSAO, "--sem-2fa" in sys.argv)
