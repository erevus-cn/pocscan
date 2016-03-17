## POCSCAN

 Pocscan是一款开源 Poc 调用框架,可轻松调用Pocsuite,Tangscan,Beebeeto <font color=red>按照官方规范编写</font>的 Poc对目标域名进行扫描，通过 Docker 一键部署，麻麻再也不怕搭建麻烦了 。
 
 哦,对了，Pocscan提供了chrome浏览器插件,插件会自动抓取网页上的host丢去扫描。ε=ε=(ノ≧∇≦)ノ
 
 架构是参考 https://github.com/netxfly/passive_scan
 
 Pocscan 只是扫描框架，不提供Poc!!!  
 Pocscan 只是扫描框架，不提供Poc!!!  
 Pocscan 只是扫描框架，不提供Poc!!!  
 
### Screenshots

![前台](./screenshots/1.png)

![后台](./screenshots/2.jpg)

### Installation

1. 安装Docker, 然后下载镜像

    	$ curl -sSL https://get.daocloud.io/docker | sh 
    	$ sudo systemctl start docker
    	$ sudo docker pull daocloud.io/aber/pocscan:1.0 
    	
2. 把源码 clone 到本地,运行 docker 容器,把源码挂载到容器里

    	docker run -d -v /tmp/pocscan/:/www -p 8090:8000 ubuntu/pocscan:latest
    	
    	/*
    	-v /tmp/pocscan/:/www 是将宿主机的/tmp/pocscan中的代码挂载到容器的/www目录中运行
    	-p 8090:8000 是将容器的8000端口映射到宿主机的8090端口
    	以上参数根据实际情况自行配置
    	*/
    	
    	
3. 把poc文件按找分类放到 /pocscan/pocs/ 下的文件夹

4. 访问一下 http://127.0.0.1:8090/login. 出现登录界面就是搭建成功了。帐号是root,密码是password.

5. 安装chrome插件,设置好API地址
	
		http://192.168.1.2:8081/scan/     #注意scan后面要用"/",注意scan后面要用"/",注意scan后面要用"/"。重要的事情说三次

### TO DO

1. 集群化部署
2. 集成 sqlmapapi

### FAQ

Q: 搭建为啥扫不出漏洞啊？(ﾟДﾟ≡ﾟдﾟ)!?

A: Pocscan 只是提供一个框架，不提供 Poc , 扫不出洞说明你的 Poc 不够多不够牛逼。



### 问题反馈 当程序出现日天的bug，或者你有更好的建议想法时，请联系我们

__author__ : erevus-cn, tlskbz
