const express = require("express");
const axios = require('axios');
const fs = require("fs");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");

// from https://codewithmark.com/learn-to-create-youtube-video-downloader
function qsToJson(qs) {
    var res = {};
    var pars = qs.split('&');
    var kv, k, v;
    for (i in pars) {
        kv = pars[i].split('=');
        k = kv[0];
        v = kv[1];
        res[k] = decodeURIComponent(v);
    }
    return res;
}
// from https://davidwalsh.name/query-string-javascript
function getUrlParameter(search, name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};

async function youTubeVideoInfo(id) {
    var url = 'http://www.youtube.com/get_video_info?html5=1&video_id=' + id;
    console.log(url,"URL to get Info")
    const videoInfoResponse = await axios.get(url);
    console.log(videoInfoResponse,"response info")
    if (videoInfoResponse.status != 200) {
        throw new Error(`YouTube get video info failed: ${videoInfoResponse.status} - ${videoInfoResponse.statusText}`);
    }
    var get_video_info = qsToJson(videoInfoResponse.data);

    // remapping urls into an array of objects
    var tmp = get_video_info["url_encoded_fmt_stream_map"];
    if (tmp) {
        tmp = tmp.split(',');
        for (i in tmp) {
            tmp[i] = qsToJson(tmp[i]);
        }
        get_video_info["url_encoded_fmt_stream_map"] = tmp;
    }

    return get_video_info;
}

const app = express();

const videoFileMap = {
  cdn: "videos/video1.mp4",
  "generate-pass": "videos/video2.mp4",
  "get-post": "videos/video3.mp4",
};
app.get('/youtube2mp4', async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (req.query.url) {
        try {
            youTubeVideoUrl = req.query.url;
            console.log(youTubeVideoUrl,"YT Url")
            youTubeVideoId = getUrlParameter(youTubeVideoUrl.substring(youTubeVideoUrl.indexOf('?')), 'v');
            console.log(youTubeVideoId,"Video Id")
            const videoInfo = await youTubeVideoInfo(youTubeVideoId);
            console.log(videoInfo,"InfoVideo")
            if (videoInfo.status === 'failed') {
                throw(new Error(`Failed due to: ${videoInfo.reason}`));
            }
            if (!!videoInfo && !!videoInfo.url_encoded_fmt_stream_map) {
                const mp4VideoEntry = videoInfo.url_encoded_fmt_stream_map.find(v => v.type.startsWith('video/mp4'));
                if (!mp4VideoEntry) {
                    throw(new Error(`Failed to resolve mp4 video for ${youTubeVideoUrl}`));
                }
                res.send(`{success:true,url:'${mp4VideoEntry.url}'}`);
            } else {
                throw(new Error(`Failed to resolve mp4 video for ${youTubeVideoUrl}`));
            }
        } catch(error) {
            res.send(`{success:false,error:'${error.message}'}`);
        }
    } else {
        res.send(`{success:false,error:'Url parameter missing'}`);
    }
});


app.get("/videos/:filename.mp4", (req, res) => {
  const fileName = req.params.filename;
  const filePath = videoFileMap[fileName];

  if (!filePath) {
    return res.status(404).send("File not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  console.log(req.headers, "Range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});
app.get("/video/stream", (req, res) => {
  // YTDL
  //   var URL = "https://www.youtube.com/watch?v=zFvLoiq58Nk";
  //   res.header("Content-Disposition", 'attachment; filename="video.mp4"');
  //   const result = ytdl(URL, {
  //     format: "mp4",
  //   }).pipe(res);
});
const videoConverter = (url) => {
  return ytdl(url, {
    quality: "highest",
  }).pipe(fs.createWriteStream('video.mp4'));
};
app.post("/video/convert", async (req, res) => {
  try {
    //   const { videoUrl } = req.body;
    const videoUrl = "https://www.youtube.com/watch?v=zFvLoiq58Nk";
    // Validate the YouTube URL
    if (!ytdl.validateURL(videoUrl)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // Download YouTube video
    const videoInfo = await ytdl.getInfo(videoUrl);
    const mp4Video = videoConverter(videoUrl);
    console.log(mp4Video,"Converted Video")
    // Convert video to MP4
    const mp4File = `./output/${videoInfo.videoDetails.title.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}.mp4`;
    const videoFilePath = "video.mp4"
    const ffmpegProcess = new ffmpeg({
        input:'video.mp4',
        output:'output.mp4'
    })
    ffmpegProcess.run();
    const outputStream = fs.createWriteStream('output.mp4');
    res.sendFile('output.mp4');
    
    // ffmpeg()
    //     .input(videoStream)
    //     .output(mp4File)
    //     .on("end", () => {
    //       console.log("Conversion finished");
    //       res.json({ mp4Link: `http://localhost:3000/${mp4File}` });
    //     })
    //     .on("error", (err) => {
    //       console.error("Error during conversion:", err);
    //       res.status(500).json({ error: "Error during conversion" });
    //     })
    //     .run()
    // if(!videoFilePath){
    //     return res.status(404).send("File not found");
    // }else{
    //     return res.status(200).send("Converted Success");
    // }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(3000, () => {
  console.log("server is listening on post 3000");
});
