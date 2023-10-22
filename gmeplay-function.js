// to do: test on mobile and old laptop; create a page listing all Voice names for all possible chips; check accuracy of test music; give the user an example of a DynamicsCompressorNode they can use on .ay music to make it sound better. (threshold should be -15?). check out gme_enable_accuracy
// to do: add "modularization" to Web-GME-Player; basically, make it so Web-GME-Player c functions are not called with Module.ccall(), but rather something like gmeModule.ccall(). If the user is using multiple emscripten things, we don't want them to conflict and overwrite each other.
// I've given up on figuring out exactly how fast beepola's output is
/*
NOTE ON panningObject AND THE N163 AND FAMISTUDIO
If you make a song in famistudio while only using some of the 8 Wave channels, the channels used in the exported nsf may be different. For example, a song that uses only two wave channels will have Wave 1 and Wave 2 mapped to Wave 8 and Wave 7 respectively when exported to nsf.
*/
// NOTE: not all SNES music can be played back, because the SPC format is insufficient for all SNES music. See vgmpf's page on SPC
// Famicom Sunsoft 5B noise is not emulated. Famicom FDS channel modulo is not perfectly emulated.
// *gme only supports Mega Drive (a.k.a. Genesis) vgm/vgz files*
// *vgm and spc will take a very long time to play.*
// Mega CD and 32x channels are not emulated.
// MSX OPLL is not emulated.
// Testing MSX OPL1 support is not possible because I cannot find a single KSS file that uses OPL1 a.k.a. MSX-AUDIO a.k.a. Y8950. If you can help, please link to or attach an OPL1 kss file to an issue on Web-GME-Player's repository.
// *only use panningObject for mono music.*
// the "worker" setting doesn't make the code run faster (it actually slows things down a little), but it moves the work off of the main thread, allowing the webpage to stay responsive while work runs in the background.
// to understand the code, you should read about the JavaScript Web Audio API, Emscripten, ternary operators, Web Workers, Promises. Please let me know if there are any prerequisites I missed.

//const gmeModule=await createGMEmodule()
var GMEend;
var gmeModule;
if (typeof window === 'object') { // web browser window
	createGMEmodule().then((result) => {
		gmeModule=result
		GMEend=gmeModule.cwrap("GMEend", "number", null)
		console.log('gmeModule ready')
	})
}

const INT16_MAX = 65535;
const SAMPLERATE = 44100;
const BUFFERSIZE = 2048;
const SystemMonoList=[
	"Nintendo NES", // the name that gme uses
	"Atari XL",
	"ZX Spectrum",
	"MSX" // gme can only play PSG and SCC, which are mono
]
const gme_info_only = -1

function gmeplay(input, tracknum, settings) {
/* settings contains loop (loopStart (milliseconds), loopEnd), length (never used with LoopObject), panningObject, worker (boolean), speed: float (0.5 is half speed. 1 is regular, etc. affects pitch) */
// when speed is set, length and introlenth values from file will be automatically adjusted, HOWEVER user-defined length and loopStart values will not be adjusted
	internalGMEplay(input, tracknum, settings, false)
}
function gmeDownload(input, tracknum, settings) {
/* settings contains loop (loopStart (milliseconds), loopEnd, loopNum), length (never used with LoopObject), panningObject, worker (boolean) */
// THIS FUNCTION IS NOT FINISHED
	internalGMEplay(input, tracknum, settings, true)
}
function internalGMEplay(input, tracknum=0, settings={}, wav=false) {
	console.log('internalGMEplay called. tracknum: '+tracknum+', wav: '+wav)
	console.log('internalGMEplay input:')
	console.log(input)
	console.log('internalGMEplay settings:')
	console.log(settings)
	
	if (wav && !SOXModule) {console.error("You are trying to save the output as a wav file, but sox-emscripten is not present to convert raw PCM to wav. https://github.com/rameshvarun/sox-emscripten ")}
	
	const filebool=(typeof input === "object")
	console.log("filebool: "+filebool)
	if ( filebool ? (/*file*/ input.name.includes(".vgz")) : (/*url*/ input.includes(".vgz")) ) {
		if (pako) {
			var vgzbool=true
		} else {
			console.error("vgz file detected, but pako is not present to extract. https://www.jsdelivr.com/package/npm/pako?tab=files ")
			return
		}
	}
	if (!settings.speed) {settings.speed=1}
	const getFunction= filebool ? getFile : getURL // placing a function inside a variable; when the variable is called with parentheses, it executes whatever function is stored inside.
	getFunction(input, vgzbool ? vgzbool : undefined).then((data) => {
		gmeModule.FS.writeFile('/home/web_user/input', data); // don't use {flags:"r"}
		// there is no reason to not run setupMusStereo in this function
		var musLength=gmeModule.ccall( // length of the song as defined in the file's metadata
			"setupMusStereo", // Sets up everything needed to play music in the c code; Also returns music length.
			"number",
			["number", "number"],
			[tracknum/* track number */, (settings.worker && !settings.panning) ? gme_info_only : SAMPLERATE/settings.speed] // gme_info_only does not allow getting total voices and voice names
		) / settings.speed
		// if the user defined a loopEnd or a length, overwrite the length obtained from the file with the user's
		if (settings.loop) {if (settings.loop.loopEnd) {musLength=settings.loop.loopEnd}}
		else if (settings.length) {musLength=settings.length};
		// if the file did not contain a length, and the user did not specify a length or loopEnd, set the length to 150000 milliseconds.
		if (musLength<= -1 || !musLength) {musLength=150000}
		console.log("musLength: "+musLength)
		
		const totalSamples=musLength/* in milliseconds */ * SAMPLERATE / 1000 // total samples in the song. // note to myself: this can be a float, should something be done about this? // this is not affected by settings.speed
		if (settings.loop) {
			if (!settings.loop.loopStart) {
				var introLength=gmeModule.ccall("getIntroLength","number") / settings.speed
				if (introLength <= -1) {introLength=0}
			} else {
				var introLength=settings.loop.loopStart // not affected by settings.speed
			}
		}
		
		if (settings.panning) {
			var totalVoices=gmeModule.ccall(
				"getTotalVoices",
				"number"
			)
			console.log('result of c:getTotalVoices: '+totalVoices)
			let getVoiceName=gmeModule.cwrap("getVoiceName", "string", ["number"])
			var VoiceDict=[] // holds the name and voice num of each voice.
			for (let i=0; i<totalVoices; i++) {
				VoiceDict[i]=getVoiceName(i)
			}
			console.log('VoiceDict completed. VoiceDict: ')
			console.log(VoiceDict)
		} else {
			var monobool=SystemMonoList.includes(gmeModule.ccall("getSystem", "string"))
		}
		
		if (settings.worker) {GMEend(); /* just gme_delete without args */ gmeModule.FS.unlink("/home/web_user/input"); /*delete file*/ console.log('deleted emu and file')}
	
	
		const genSamplesFunc= settings.worker ? workerGMEgenSamples : GMEgenSamples
		genSamplesFunc(settings, totalSamples, totalVoices ? totalVoices : undefined, VoiceDict ? VoiceDict : undefined, (monobool!=undefined) ? monobool : undefined, data ? data : undefined, (tracknum!=undefined) ? tracknum : undefined).then((MusRec) => {
			if (settings.panning || wav) {
				if (settings.panning) {var MusRecOther=MusRec.pop()}
				GenerateAudioBuffer(MusRec, MusRecOther ? MusRecOther : undefined, totalSamples, musLength, (introLength!=undefined) ? introLength : undefined, wav, monobool/*why doesn't this error?*/, settings, totalVoices ? totalVoices : undefined, VoiceDict ? VoiceDict : undefined).then((value) => { // uses OfflineAudioContext to generate an audio buffer
					const MusOutput=value[0]
					if (wav) {
						wavFilename= filebool ? input.name : input
						wavFilename=wavFilename.replace(/\.....?$/i, '.wav') // regex: replace any 3 or 4 character file extension with wav
						console.log('wavFilename: '+wavFilename)
						generateWavAndDownload(MusOutput, wavFilename, settings.panning ? false : monobool)
					} else {
						const sourceNodeSettings=value[1]; 
						console.log(sourceNodeSettings);
						genAndStartSourceNode(undefined, sourceNodeSettings, monobool, totalSamples, MusOutput) // plays the generated buffer on the device's speakers/headphones/etc.
					}
				}) 
				
			} else {
				var sourceNodeSettings={}
				if (settings.loop) {
					sourceNodeSettings={loop:true, loopEnd:musLength/1000, loopStart:introLength/1000}
				}
				sourceNodeSettings.channelCount= (monobool===false) ? 2 : 1
				genAndStartSourceNode(undefined, sourceNodeSettings, monobool, totalSamples, undefined, MusRec)
			}
		})
		
	})
}

async function GMEgenSamples(settings, totalSamples, totalVoices, VoiceDict, monobool) {
	console.log('GMEgenSamples called in '+( (typeof importScripts === 'function') ? "worker" : "window" )+', totalSamples: '+totalSamples+', totalVoices: '+totalVoices+', monobool: '+monobool)
	console.log('GMEgenSamples settings:')
	console.log(settings)
	console.log('GMEgenSamples VoiceDict:')
	console.log(VoiceDict)
	
	// bufferSize will always be 2048. Latency doesn't matter, because unlike the Chip Player JS code I used months ago as reference, we're not rendering the audio in real time.
	
	var bufferNum=totalSamples/(BUFFERSIZE/2/*numChannels*/); // number of whole buffers that need to be generated to complete the song
	if (!Number.isInteger(bufferNum)) {
		var oneMoreRun=true;
		bufferNum=Math.floor(bufferNum)
	} else {oneMoreRun=false}
	if (settings.panning) {
		var MusRec=[]
		const changeVoice=gmeModule.cwrap("setVoiceForRecording", "number", ["number"]) // function: rewinds track back to the beginning and mutes all voices except the voice specified in the argument.
		const toMusRecOther=[] // contains the number of each channel that is not in the panning object.
		for (let voice=0; voice<totalVoices; voice++) {
			if (settings.panning[VoiceDict[voice]]) { // if the current voice is in the panning object (VoiceDict converts the number into a name)
				MusRec[voice]=new Float32Array(totalSamples)
				changeVoice(voice)
				genGMEbuffers(MusRec[voice], bufferNum, oneMoreRun, true /* record like mono */, totalSamples)
			} else {
				toMusRecOther.push(voice)
			}
		}
		console.log(toMusRecOther)
		const MusRecOther=new Float32Array(totalSamples) // contains sample data of every voice not in panningObject. Each voice is NOT in its own index, MusRecOther is an array of floating point samples.
		const unmuteVoice=gmeModule.cwrap("unmuteVoice", "number", ["number"])
		changeVoice(toMusRecOther[0])
		console.log("toMusRecOther[0]: "+toMusRecOther[0])
		for (let i=0; i<totalVoices; i++) {
			if (toMusRecOther.includes(i)) {
				unmuteVoice(i)
			}
		}
		genGMEbuffers(MusRecOther, bufferNum, oneMoreRun, true /* record like mono */, totalSamples)
		MusRec.push(MusRecOther)
	} else {
		if (monobool) {
			var MusRec=new Float32Array(totalSamples)
		} else { // stereo
			var MusRec=[]
			MusRec[0]/*left*/ = new Float32Array(totalSamples)
			MusRec[1]/*right*/ = new Float32Array(totalSamples)
		}
		console.log('no panning: MusRec initialized. MusRec:')
		console.log(MusRec)
		genGMEbuffers(MusRec, bufferNum, oneMoreRun, monobool, totalSamples)
	}
	// gme_delete
	// FS delete file
	GMEend() /* just gme_delete without args */  // it doesn't work
	gmeModule.FS.unlink("/home/web_user/input"); /*delete file*/
	console.log('GMEgenSamples finished. MusRec:')
	console.log(MusRec)
	return MusRec
}
function genGMEbuffers(MusRec, bufferNum, oneMoreRun, mono, totalSamples) {
	console.log('genGMEbuffers called. bufferNum: '+bufferNum+', oneMoreRun: '+oneMoreRun+', mono: '+mono+', totalSamples: '+totalSamples)
	console.log('genGMEbuffers MusRec:')
	console.log(MusRec)
	const playMus=gmeModule.cwrap("playMus", "number", null) // the playMus function generates samples when it is run.
	if (mono===false) { // stereo
		var addBufferToMusRec=function(MusRec, bufPtr, curBuffer, limiter){
			//console.log('function expression addBufferToMusRec (stereo) called. bufPtr: '+bufPtr+', curBuffer: '+curBuffer+', limiter: '+limiter);
			for (let channel=0; channel<2; channel++) {
				addBufferToSampleArray(MusRec[channel], bufPtr, curBuffer, limiter, channel)
			}
		};
	} else {
		var addBufferToMusRec=addBufferToSampleArray
	}
	
	for (let i=0; i<bufferNum; i++) {
		let bufPtr=playMus()
		addBufferToMusRec(MusRec, bufPtr, i, BUFFERSIZE)
	}
	if (oneMoreRun) {
		let bufPtr=playMus()
		addBufferToMusRec(MusRec, bufPtr, bufferNum, (totalSamples-bufferNum*(BUFFERSIZE/2/*numChannels*/))*2/*to compensate for limiter being divided by 2*/)
	}
}
function addBufferToSampleArray(SampleArray /* Float32Array */, bufPtr, curBuffer/* integer, the number of whole buffers that have been generated thus far */, limiter, channel=0) { // add to the input Float32Array in place
	//console.log('addBufferToSampleArray called. bufPtr: '+bufPtr+', curBuffer: '+curBuffer+', limiter: '+limiter+', channel: '+channel)
	for(let i=0; i*2/*numChannels*/<limiter/*number of int16 samples*/; i++){
		SampleArray[i+curBuffer*BUFFERSIZE / 2/*numChannels*/]= gmeModule.getValue(bufPtr + (i * 2/*bytes per sample*/) * 2/*numChannels*/ + channel * 2/*bytes per sample*/, 'i16') / INT16_MAX /* convert int16 to float*/
	}
}
function workerGMEgenSamples(settings, totalSamples, totalVoices, VoiceDict, monobool, data, tracknum) {
// using the "async" keyword before "function" to convert a callback api to a promise, doesn't appear to work. I changed this to "return Promise" https://stackoverflow.com/questions/22519784/how-do-i-convert-an-existing-callback-api-to-promises
	console.log('workerGMEgenSamples called. totalSamples: '+totalSamples+', totalVoices: '+totalVoices+', monobool: '+monobool+', tracknum: '+tracknum)
	console.log('workerGMEgenSamples settings:')
	console.log(settings)
	console.log('workerGMEgenSamples VoiceDict:')
	console.log(VoiceDict)
	console.log('workerGMEgenSamples data:')
	console.log(data)
	return new Promise(function(resolve, reject) {
		const gmeWorker = new Worker("gme-worker.js");
		console.log('worker created');
		gmeWorker.addEventListener("message", function(e){
			console.log("message received from gmeWorker")
			gmeWorker.terminate();
			//return e.data // MusRec
			resolve(e.data) // MusRec
		}, {once:true})
		gmeWorker.postMessage([settings, totalSamples, totalVoices, VoiceDict, monobool, data, tracknum])
		console.log('message posted to worker')
	})
}

async function GenerateAudioBuffer(MusRec, MusRecOther, bufferLength, musLength, loopStart, wav, monobool, settings, totalVoices, VoiceDict) {
	console.log('GenerateAudioBuffer called. bufferLength: '+bufferLength+', musLength: '+musLength+', loopStart: '+loopStart+', wav: '+wav+', monobool: '+monobool+', totalVoices: '+totalVoices)
	console.log('GenerateAudioBuffer MusRec:')
	console.log(MusRec)
	console.log('GenerateAudioBuffer MusRecOther:')
	console.log(MusRecOther)
	console.log('GenerateAudioBuffer settings:')
	console.log(settings)
	
	if (wav) {var loopNum = settings?.loop?.loopNum ? settings.loop.loopNum : 2}
	// loopNum must be at least 1. Int
	
	/* if we're recording loops for wav, then bufferLength would be the length of the loops */
	const actx= new OfflineAudioContext(2, (wav && settings.loop) ? (musLength+(loopNum-1/*the first loop is always a part of what GME generates*/)*(musLength-loopStart/*length of a loop without intro*/))*SAMPLERATE/1000 : bufferLength, SAMPLERATE)
	var sourceNodeSettings={};
	if (loopStart!=undefined/* && wav*/) {
		sourceNodeSettings={loop:true, loopEnd:musLength/1000, loopStart:loopStart/1000}
	}
	sourceNodeSettings.channelCount= (!monobool && !settings.pannings /*system is stereo && panning is not defined */) ? 2 : 1
	console.log(sourceNodeSettings)
	if (settings.panning) {
		var MusRecBuffers=[]
		var sourceNodes=[]
		var stereoPannerNodes=[]
		for (let i=0; i<totalVoices; i++) {
			if (MusRec[i]) {
				MusRecBuffers[i]=createAudioBufferAndFill(1, bufferLength, MusRec[i], actx)
				sourceNodes[i] = new AudioBufferSourceNode(actx, sourceNodeSettings)
				sourceNodes[i].buffer=MusRecBuffers[i]
				stereoPannerNodes[i]=new StereoPannerNode(actx, {pan:settings.panning[VoiceDict[i]]})
				sourceNodes[i].connect(stereoPannerNodes[i])
				stereoPannerNodes[i].connect(actx.destination)
			}
		}
		var MusRecBufferOther=createAudioBufferAndFill(1, bufferLength, MusRecOther, actx)
		var sourceNodeOther=new AudioBufferSourceNode(actx, sourceNodeSettings)
		sourceNodeOther.buffer=MusRecBufferOther
		sourceNodeOther.connect(actx.destination)
		for (let i=0; i<totalVoices; i++) {
			if (sourceNodes[i]!=null){
				sourceNodes[i].start(actx.currentTime+0.1)
				console.log("started "+i)
			}
		}
		sourceNodeOther.start(actx.currentTime+0.1)
	} else if (wav) {
		// if mono (or stereo? just not panning) and generating wav file, don't create an audio buffer and just return MusRec? it would also have to be no looping, which is unlikely
		genAndStartSourceNode(actx, sourceNodeSettings, monobool, bufferLength, undefined, MusRec)
	} else { console.error("don't use GenerateAudioBuffer for simple playback of music") }
	const MusOutput = await actx.startRendering()
	return [MusOutput, sourceNodeSettings]
}
function genAndStartSourceNode(inputOfflineActx, sourceNodeSettings, monobool, bufferLength, inputAudioBuffer, MusRec) {
	console.log('genAndStartSourceNode called. monobool: '+monobool+', bufferLength: '+bufferLength)
	console.log('genAndStartSourceNode inputOfflineActx:')
	console.log(inputOfflineActx)
	console.log('genAndStartSourceNode sourceNodeSettings:')
	console.log(sourceNodeSettings)
	console.log('genAndStartSourceNode inputAudioBuffer:')
	console.log(inputAudioBuffer)
	console.log('genAndStartSourceNode MusRec:')
	console.log(MusRec)
	
	const actx= inputOfflineActx ? inputOfflineActx : new AudioContext({sampleRate:44100});
	const audioBuffer= MusRec ? createAudioBufferAndFill(monobool ? 1 : 2, bufferLength, MusRec, actx) : inputAudioBuffer
	const sourceNode= new AudioBufferSourceNode(actx, sourceNodeSettings)
	sourceNode.buffer=audioBuffer
	sourceNode.connect(actx.destination)
	sourceNode.start(0.1)
}
function createAudioBufferAndFill(numChannels, bufferLength, MusRec, audioCtx) {
	const MusRecBuffer=audioCtx.createBuffer(
		numChannels,
		bufferLength,
		SAMPLERATE
	);
	if (numChannels===2) {
		for (let channel=0; channel<numChannels; channel++) {
			fillAudioBufferWithMusRec(MusRecBuffer, MusRec[channel], bufferLength, channel)
		}
	} else {
		fillAudioBufferWithMusRec(MusRecBuffer, MusRec, bufferLength, 0)
	}
	return MusRecBuffer
}
function fillAudioBufferWithMusRec(MusRecBuffer, MusRec, bufferLength, channel) {
	const nowBuffering=MusRecBuffer.getChannelData(channel)
	for (let i = 0; i < bufferLength; i++) {
		nowBuffering[i]=MusRec[i]
	}
}
function generateWavAndDownload(MusOutput, name, monobool) {
	console.log('generateWavAndDownload called. name: '+name+', monobool: '+monobool)
	console.log('generateWavAndDownload MusOutput:')
	console.log(MusOutput)
	
	PCMdata=[]
	PCMdata[0]=MusOutput.getChannelData(0) // left
	console.log('PCMdata[0]: ')
	console.log(PCMdata[0])
	if (!monobool) {PCMdata[1]=MusOutput.getChannelData(1)} // right
	const inputRawArguments=['-t', 'raw', '-L', "-r", "44100", "-e", "floating-point", "-b", "32", "-c", "1"/*, "input1.raw"*/]
	var soxArguments= monobool ? [] : ['-M']
	soxArguments=soxArguments.concat(inputRawArguments, "input1.raw")
	if (!monobool) {soxArguments=soxArguments.concat(inputRawArguments, "input2.raw")}
	const outputWavArguments=['-e', 'signed-integer', '-b', '16', '-c'] // we convert back to 16bit to save space. the samples generated by gme were originally 16bit
	soxArguments=soxArguments.concat(outputWavArguments, monobool ? '1' : '2', 'output.wav')
	console.log(soxArguments.join(' '))
	var inputmodule={
		arguments: soxArguments,
		preRun: () => {
			inputmodule.FS.writeFile("input1.raw", new Uint8Array(PCMdata[0].buffer/*Returns the ArrayBuffer referenced by the typed array.*/));
			// Emscripten FS.writeFile only functions properly with Uint8Arrays.
			if (!monobool) {inputmodule.FS.writeFile("input2.raw", new Uint8Array(PCMdata[1].buffer))};
			
			//let debugInput = inputmodule.FS.readFile("input1.raw", {
			//	encoding: "binary"
			//});
			//download(new File([debugInput], 'input1.raw'))
		},
		postRun: () => {
			let output = inputmodule.FS.readFile("output.wav", {
				encoding: "binary"
			});
			download(new File([output], name))
		},
	};
	SOXModule(inputmodule);
}

function download(file) { // to do: replace the file argument with blob and name?
	const link = document.createElement('a')
	const url = URL.createObjectURL(file)
	
	link.href = url
	link.download = file.name
	document.body.appendChild(link)
	link.click()
	
	document.body.removeChild(link)
	window.URL.revokeObjectURL(url)
}
async function getURL(url, vgzbool) {
	var response = await fetch(url)
	response = await response.arrayBuffer()
	var data=new Uint8Array(response)
	if (vgzbool) {
		data=pako.inflate(data);
	}
	console.log("getURL finished")
	return data;
}
function getFile(file, vgzbool) {
	return new Promise(function(resolve, reject) {
		const reader=new FileReader();
		reader.readAsArrayBuffer(file);
		reader.onloadend = (evt) => {
			if (evt.target.readyState === FileReader.DONE) {
				let arrayBuffer = evt.target.result
				var data = new Uint8Array(arrayBuffer);
				if (vgzbool) {
					data=pako.inflate(data);
				}
				console.log("getFile finished")
				//return data;
				resolve(data)
			} // to do: place reject here
		}
	})
}