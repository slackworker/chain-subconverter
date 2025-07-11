docker build -t chain-subconverter:latest .
docker stop chain-subconverter && docker rm chain-subconverter
docker run -d --name chain-subconverter -p 11200:11200 --restart unless-stopped chain-subconverter:latest