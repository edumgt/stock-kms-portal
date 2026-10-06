# 금일 시험 안내

## https://github.com/edumgt/investment-analysis 의 웹앱과 
## https://github.com/edumgt/domain-rag-lab 의 웹앱을 통합(하나로 합침)

## 해당 웹앱의 기능에서 본인 만의 금융, 경제 정보 웹앱으로 메뉴, 기능을 개편하고
## AWS Cloud 의 EC2 에 올려서 해당 EIP(탄력적 IP) 를 공유 합니다.

## 4시까지 작업 후 디스코드에 홍길동 - http://본인 사용 IP(예:1.2.3.4) 로 공유 합니다.
## 디스코드의 훈련생 올린 IP 에 접속하여, 각자 판단에 따라 100점 이모지를 붙여주시면, 해당 이미지콘의 갯수로 총점을 정해 시험점수로 반영 합니다.

![alt text](image.png)

## 4시까지의 작업이 원할히 진행되면, 람다, API GW 를 붙여보는 작업을 추가합니다.
## 2026-10-06 GitHub Actions 정비 (에이전트, 미커밋)
- ECR 경로 제거: `.github/workflows/cd-ecr.yml`, `docker-compose.ecr.yml` 삭제(git rm). GitHub 에서 "CD — Build to ECR and Deploy" disable.
- `cd.yml` rsync 에 `--exclude 'data/lean-workflows'`, `--filter 'protect data/'` 추가(domain-rag-lab 과 동일).
- 시크릿: `EC2_SSH_PRIVATE_KEY`(fd.edumgt.co.kr.pem)·`EC2_USER=ubuntu` 만 등록. `EC2_HOST`/`EC2_APP_DIR` 은 **의도적으로 비움** — 현재 `cd.yml` 은 `-p domain-rag-lab -f docker-compose.prod.yml`(자체 Caddy 80/443) 이라 fd 서버에 그대로 올리면 pr 스택과 충돌. 대상 서버·compose·프로젝트명 결정 후 등록(domain-rag-lab todo.md 8-1 참고).
