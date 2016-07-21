import nmap
import views
from .models import portScan, portScAction


class portinfo(views.info):
    def __init__(self, ip, ports, args):
        views.info.__init__(self)
        self.port_info = {}
        self.ip = ip
        self.ports = ports
        self.args = args
        self.get_info()
        self.save_info()

    def get_info(self):
        nm = nmap.PortScanner()
        try:
            self.port_info = nm.scan(hosts=self.ip, ports=self.ports, arguments=self.args)
        except Exception,e:
            print e


    def save_info(self):
        info = self.port_info
        try:
            command = info['nmap']['command_line']
            scaction = portScAction(
                target=self.ip,
                command=command,
            )
            scaction.save()
            for (ip, ipInfo) in info['scan'].items():
                for (ports, portInfo) in ipInfo['tcp'].items():
                    name = portInfo['name']
                    product = portInfo['product']
                    version = portInfo['version']

                    currentInfo = portScan(
                        ip=ip,
                        psaId_id=scaction.id,
                        portNumber=ports,
                        server=name,
                        version=version,
                        product=product,
                    )

                    currentInfo.save()
        except Exception,e:
            print e
