# Usa a imagem oficial Node.js 18 como base
FROM node:18

# Atualiza o apt e instala Python3 e pip
RUN apt-get update && apt-get install -y python3 python3-pip

# Instala yt-dlp via pip
RUN pip3 install yt-dlp

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências para instalar antes do código (cache de camadas)
COPY package*.json ./

# Instala as dependências Node.js
RUN npm install

# Copia todo o código do backend para dentro do container
COPY . .

# Expõe a porta que o app vai rodar
EXPOSE 3005

# Comando para iniciar o backend
CMD ["npm", "start"]