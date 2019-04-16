import json
import logging
import os


class ServerConfig:
    def __init__(self, channel, lang):
        self.channel = channel
        self.lang = lang

class Data:
    def __init__(self):
        self.__logger = logging.getLogger("Config")
        logging.basicConfig(
            format="[%(asctime)s][%(levelname)s][%(name)s] %(message)s", level=logging.INFO)
        self.__logger.info("Loading Data...")
        if os.path.isfile("./vlogdata.json") == False:
            with open("./vlogdata.json", "w") as fs:
                fs.write("{}")
        try:
            with open("./vlogdata.json", "r") as fs:
                self.__dataraw = json.load(fs)
        except json.decoder.JSONDecodeError as e1:
            self.__logger.error(
                "Can't load vlogdata.json: JSON decode error:{0}".format(str(e1.args)))
            self.__logger.info("Maybe it's an old data, trying to migrate...")
            try:
                with open("./vlogdata.json", "r") as fs:
                    self.__dataraw = eval(fs.read())
                self.__saveData()
            except SyntaxError:
                self.__logger.error("Can't load vlogdata.json: Syntax Error")
                exit()

    def getData(self,server):
        if server not in self.__dataraw:
            self.setData(server)
        return ServerConfig(self.__dataraw[server]['channel'], self.__dataraw[server]['lang'])

    def setData(self, server, channel="-1", lang="en_US"):
        self.__dataraw[server] = {"channel": channel, "lang": lang}
        self.__saveData()

    def setLang(self,server,lang):
        self.__dataraw[server]['lang'] = lang
        self.__saveData()

    def __saveData(self):
        with open("./vlogdata.json", "w") as fs:
            json.dump(self.__dataraw, fs, indent=2)
