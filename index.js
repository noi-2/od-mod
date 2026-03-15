const fs = require("fs");

const fetch = require("cross-fetch");
const { Socket } = require("net");

async function readFileBytesRange(start, end, filepath) {
    const readStream = fs.createReadStream(filepath, { start, end });
    return await new Promise(resolve => {
        let res = "";
        readStream.on("data", chunk => {
            res += chunk;
        });
        readStream.on("end", () => {
            console.log(res.length);
            resolve(res);
            console.log("read finished")
        });
        readStream.on("error", err => {
            console.error(err)
        })
    });

}


async function check_mics_server_connectivty() {
    const res_list = ([await check_hostname_delay_ms("graph.microsoft.com"), await check_hostname_delay_ms("login.microsoftonline.com"),]);
    const res_list_alias_name = ['graph.microsoft.com：      ', 'login.microsoftonline.com：']
    if (
        res_list.some(v => /error/.test(v))
    ) {
        console.log("connectivity failed, please check the error domain")
    }
    return res_list.map((v, k) => {
        return `${res_list_alias_name[k]}${v['duration']} ms`
    }).join("\n");
}
async function check_hostname_delay_ms(host, port = 443) {
    const socket = new Socket();
    const startTime = process.hrtime.bigint();
    const result = (error) => {
        const end = process.hrtime.bigint();
        const duration = error || Math.round(Number(end - startTime) / 1e6);
        socket.destroy();
        return { duration }
    };
    let return_res;
    try {
        return_res = new Promise((resolve, reject) => {
            socket.connect(port, host, () => resolve(result()));
            socket.on("error", (error) => reject(result(error)));
            socket.setTimeout(3000, () => {
                reject(result(Error(`timeout (${timeout}ms)`)))
            })
        });

    } catch (e) {
        return_res = { duration: 'error' }
    };
    return return_res;
}

module.exports = class Main {
    constructor({ od_code, client_secret, ...obj }) {
        this.od_code = od_code;
        this.client_secret = client_secret;
        this.init();
        this.refresh_token = obj['refresh_token'];
    }
    async init() {
        await this.check_server_connectivity();
        if (this.refresh_token) {
            await this.get_new_access_token();
        } else {
            await this.get_refresh_token();
        };
        this.download(`backups/10938.exe`)

    }
    _JSON_PARSE(string) {
        try {
            return JSON.parse(string);
        } catch {
            return string;
        }
    }
    async check_server_connectivity() {
        check_mics_server_connectivty().then(console.log)
    }
    async get_refresh_token() {
        const res = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: `client_id=9ec05e4f-195f-4d7f-8567-483b5b10a30a&redirect_uri=http://localhost:3111&client_secret=${this.client_secret}
&code=${this.od_code}&grant_type=authorization_code`
        });
        const res_json = this._JSON_PARSE(await res.text());
        if (typeof res_json === "string") throw Error("get_refresh_token json_parse error, " + res_json);
        if (Reflect.ownKeys(res_json).includes("error")) {
            return console.log(res_json);
        }
        this.access_token = res_json['access_token'];
        this.refresh_token = res_json['refresh_token'];
        console.log("please save this refresh_token, it can repeat use");
        console.log(res_json['refresh_token'])
        await this.get_new_access_token();

    }
    async get_new_access_token() {
        const res = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: `client_id=9ec05e4f-195f-4d7f-8567-483b5b10a30a&redirect_uri=http://localhost:3111&client_secret=${this.client_secret}
&refresh_token=${this.refresh_token}&grant_type=refresh_token`
        });
        const res_json = this._JSON_PARSE(await res.text());
        if (typeof res_json === "string") throw Error("get_refresh_token json_parse error, " + res_json);
        if (Reflect.ownKeys(res_json).includes("error")) {
            return console.log(res_json);
        }
        this.access_token = res_json['access_token'];
    }
    async get_file_size(filepath) {
        const res = await fs.promises.stat("tes.exe");
        const res_size = (res['size']);
        return res_size;
    }
    async put_upload_url(url, chunk_size, chunk_range, file_size, chunk) {
        console.log({
                   "content-length": chunk_size,
                "content-range": `bytes ${chunk_range}/${file_size}`,
        })
        const res = await fetch(url, {
            method: "PUT",
            headers: {
                "content-length": chunk_size,
                "content-range": `bytes ${chunk_range}/${file_size}`,
            },
            body: chunk
        });
        return (await res.json());
    }
    async create_upload_session(filepath_upload, filename_upload, file_size, file_path) {
        const res = await fetch(`https://graph.microsoft.com/v1.0/drive/root:/${filepath_upload}${filename_upload}:/createUploadSession`, {
            method: "POST",
            headers: {
                'content-type': "application/json",
                "Authorization": `bearer ${this.access_token}`
            },
            body: JSON.stringify({
                "@microsoft.graph.conflictBehavior": "rename | fail | replace",
                "description": "description",
                "fileSystemInfo": { "@odata.type": "microsoft.graph.fileSystemInfo" },
                "name": filename_upload
            })
        });
        const res_json = (await res.json());
        console.log(res_json);
        const loop_count = Math.ceil(file_size / 10485760);
        let start = 0;
        let end = 10485760;
        let contentLength = 10485761;
        let urls = res_json['uploadUrl'];
        for(let i =0; i<loop_count;i++){
            let res_d = await this.put_upload_url(
            urls,
            contentLength,
            `${start}-${end}`,
            file_size,
            fs.createReadStream(file_path,{start,end})
            );
            console.log(res_d);
            start = end+1;
            if(parseInt(file_size) - start < 10485760){
                console.log("complete file");
                console.log(parseInt(file_size)-start)
                end+=parseInt(file_size)-start;
                contentLength = parseInt(file_size) - start;
            }else{

                end=start+10485760;
            }
        }

        
    }
    async copy(item_id,parentReference){
        const res = await fetch(`/me/drive/items/{item-id}/copy`,{
            method:"POST",
            headers:{
                "content-type":'application/json'
            },
            body:JSON.stringify({
                /* 
  "parentReference": {
    "driveId": "6F7D00BF-FC4D-4E62-9769-6AEA81F3A21B",
    "id": "DCD0D3AD-8989-4F23-A5A2-2C086050513F"
  },
  "name": "contoso plan (copy).txt" */
            })}
        );
        console.log(await res.text())
    }
    async mkdir(dirname){
        const res = await fetch(`/me/drive/root/children`,{
            method:"POST",
            headers:{
                "content-type":"application/json"
            },
            body:JSON.stringify({
                /* {
  "name": "New Folder",
  "folder": { },
  "@microsoft.graph.conflictBehavior": "rename"
} */
            })
        });
        console.log(await res.text());

    }
    async move(item_id,new_path_id,item_name){
        const res = await fetch(`/me/drive/items/{item-id}`,{
            method:"PATCH",
            headers:{
                "content-type":'application/json',
            },
            body:JSON.stringify({
                "parentReference": {
                    "id": item_id
                },
                "name": item_name
                            })
        });
        console.log(await res.text());

    }
    async search(query){
        const res = await fetch(`/me/drive/root/search(q='{search-query}')`,{
            method:"GET",
            headers:{
                /* authorization here  */
                // "content-type":
            },
        });
        console.log(await res.text());
    }
    async delete(item_id){
        const res  = await fetch(` /me/drive/items/{item-id}`,{
            method:"DELETE",
            headers:{
                /* authotication here */
            },

        });
        console.log(await res.text());
        
    }
    async item_info(){}
    async download(path){
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`,{
            method:"GET",
            headers:{
                                "Authorization": `bearer ${this.access_token}`
            }
        });
        const fs_stream = fs.createWriteStream("test.exe");
        const write_ = await res.body.pipe(fs_stream);
        write_.on("finish",function(){
            fs_stream.close();
        })
        
        console.log(res.headers)
    }
    async list(path = "") {
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root${path && `:/${path}:`}/children`, {
            method: "GET",
            headers: {
                "Authorization": `bearer ${this.access_token}`
            }
        });
        console.log({
            "Authorization": `bearer ${this.access_token}`
        });
        console.log(await res.text());
    }
}
