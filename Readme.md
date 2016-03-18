## POCSCAN

 Pocscan是一款开源 Poc 调用框架,可轻松调用Pocsuite,Tangscan,Beebeeto,Knowsec老版本POC <font color=red>按照官方规范编写</font>的 Poc对目标域名进行扫描，通过 Docker 一键部署，麻麻再也不怕搭建麻烦了 。
 
Pocscan支持被动式扫描,还提供了chrome浏览器插件,插件会自动抓取你访问的网站host进行漏洞扫描。ε=ε=(ノ≧∇≦)ノ
 
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
    	$ sudo docker pull daocloud.io/aber/pocscan:1.1
    	
2. 把源码 clone 到本地,运行 docker 容器,把源码挂载到容器里

        docker run -d -v [代码存放目录]:/www -p 8090:8000 daocloud.io/aber/pocscan:1.1
    	
    	/*
    	-p 8090:8000 是将容器的8000端口映射到宿主机的8090端口
    	以上参数根据实际情况自行配置
    	*/
    	
    	
3. 把poc文件按找分类放到 /pocscan/pocs/ 下的文件夹

4. 访问一下 http://127.0.0.1:8090/login. 出现登录界面就是搭建成功了。帐号是root,密码是password.

5. 安装chrome插件(代码根目录那个crx文件),装好设置好API地址.要扫描时保持插件页面的打开。
	
		http://192.168.1.2:8081/scan/     #注意scan后面要用"/",注意scan后面要用"/",注意scan后面要用"/"。重要的事情说三次

### TO DO

1. 集成 sqlmapapi 和 XSS 检测.(准备开发完成)

### FAQ

Q: 搭建为啥扫不出漏洞啊？(ﾟДﾟ≡ﾟдﾟ)!?

A: Pocscan 只是提供一个框架，不提供 Poc (其实还是提供了demo poc的), 扫不出洞说明你的 Poc 不够多不够牛逼。

Q: POC 哪里找？

A：上sebug.net,tangscan.com,beebeeto.com兑换.或者自己写.



### 问题反馈 当程序出现日天的bug，或者你有更好的建议想法时，请提issue

__author__ : 只有两人bilibili团队,erevus, tlskbz
