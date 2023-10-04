const INT16_MAX = 65535;
const SystemMonoList=[
	"Nintendo NES", // the name that gme uses
	"Atari XL",
	"ZX Spectrum",
	"MSX" // gme can only play PSG and SCC, which are mono
]
importScripts("Web-GME-Player.js");

var globalData;

let counter=0;

Module['onRuntimeInitialized'] = function() {
	console.log('emscripten initialized')
	counter++
	if (counter===2) {
		gmeplay(globalData.url, globalData.tracknum, globalData.audioCtxProperties, globalData.settingsObject)
	}
}

onmessage = function(e) {
	console.log("Message received from main script");
	globalData=e.data
	counter++
	if (counter===2) {
		gmeplay(globalData.url, globalData.tracknum, globalData.audioCtxProperties, globalData.settingsObject)
	}
};

async function gmeplay(url, tracknum, audioCtx, settingsObject /*contains LoopObject (loopStart (milliseconds), loopEnd), length (never used with LoopObject), panningObject*/) {
	// to do: add an alternative to gmeplay that runs in a web worker, for vgm music; create a page listing all Voice names for all possible chips; check accuracy of test music; give the user an example of a DynamicsCompressorNode they can use on .ay music to make it sound better. (threshold should be -15?).
	/*
	NOTE ON panningObject AND THE N163 AND FAMISTUDIO
	If you make a song in famistudio while only using some of the 8 Wave channels, the channels used in the exported nsf may be different. For example, a song that uses only two wave channels will have Wave 1 and Wave 2 mapped to Wave 8 and Wave 7 respectively when exported to nsf.
	*/
	// NOTE: not all SNES music can be played back, because the SPC format is insufficient for all SNES music. See vgmpf's page on SPC
	// Famicom Sunsoft 5B noise is not emulated. Famicom FDS channel modulo is not perfectly emulated.
	// Mega CD and 32x channels are not emulated.
	// MSX OPLL is not emulated.
	// Testing MSX OPL1 support is not possible because I cannot find a single KSS file that uses OPL1 a.k.a. MSX-AUDIO a.k.a. Y8950. If you can help, please open an issue on the Web-GME-Player GitHub repository, and either link to the KSS file or zip it and attach it to the issue.
	// vgm may take a very long time to play.
	// *only use panningObject for mono music.*
	// to understand the code, you should read about the JavaScript Web Audio API and Emscripten
	if (url.includes(".vgz")) {
		try {
			importScripts("pako.min.js");
			var vgzbool=true
		} catch {
			console.error("vgz file detected, but pako is not present to extract. https://www.jsdelivr.com/package/npm/pako?tab=files ")
			return // send message to main to terminate
		}
	}
	
	if (settingsObject) {
		console.log(settingsObject)
		if (settingsObject.panningObject!=null) {
			console.log("settingsObject.panningObject exists")
			var panningObject=settingsObject.panningObject
		}
		if (settingsObject.LoopObject!=null) {
			console.log("settingsObject.LoopObject exists")
			var LoopObject=settingsObject.LoopObject
		}
		if (settingsObject.length!=null) {
			console.log("settingsObject.length exists")
			var settingsObjectLength=settingsObject.length
		}
	}
	
	var response = await fetch(url)
	response = await response.arrayBuffer()
	var data=new Uint8Array(response)
	if (vgzbool) {
		data=pako.inflate(data);
	}
	// write the file retrieved from the url to Emscripten's MEMFS as an extensionless file named "input"
	FS.writeFile('/home/web_user/input', data); // don't use {flags:"r"}
	//const audioCtx=new AudioContext({latencyHint:"playback",sampleRate:44100});
	// to do: check if this code copied from Chip Player JS ever results in anything other than 2048; if not, replace this code with just 2048.
	const bufferSize = Math.max(
		Math.pow(2, Math.ceil(Math.log2((audioCtx.baseLatency || 0.001) * audioCtx.sampleRate))), 2048);
	console.log(bufferSize);
	var musLength=Module.ccall( // length of the song as defined in the file's metadata
		"setupMusStereo", // Sets up everything needed to play music in the c code; Also returns music length.
		"number",
		["number", "number"],
		[bufferSize, tracknum/* track number */]
	)
	// if the user defined a loopEnd or a length, overwrite the length obtained from the file with the user's
	if (LoopObject) {if (LoopObject.loopEnd) {musLength=LoopObject.loopEnd}}
	else if (settingsObjectLength) {musLength=settingsObjectLength};
	// if the file did not contain a length, and the user did not specify a length or loopEnd, set the length to 150000 milliseconds.
	if (musLength<= -1 || !musLength) {musLength=150000}
	console.log("musLength: "+musLength)
	var playMus=Module.cwrap("playMus", "number", null) // the playMus function generates samples when it is run.
	// MusRec: stores the audio data of the song. The format of this data depends on whether the music is stereo or mono or using panningObject.
	// mono: each element in the array is a single floating point sample (page that contains definition of sample: https://www.izotope.com/en/learn/digital-audio-basics-sample-rate-and-bit-depth.html).
	// stereo: the MusRec array contains two elements, one for each stereo channel. The first element contains an array of floating point samples for the left ear; the second element contains an array of floating point samples for the right ear.
	// panningObject: each index in the MusRec array corresponds to the index number of a voice (example: the NES triangle channel is a voice, the NES noise channel is another voice). For voices that aren't in panningObject, the index will be nothing. For voices that are in panningObject, the index will lead to an array containing the sample data for that voice.
	var MusRec;
	var getTime=Module.cwrap("getTime", "number", null) // getTime function: returns elapsed track time in milliseconds
	var totalSamples=musLength/* in milliseconds */ * 44100/*sample rate*/ / 1000 // total samples in the song. // this can be a float, should something be done about this?
	
	let bufferNum=totalSamples/bufferSize
	let oneMoreRun=false
	if (!Number.isInteger(bufferNum)) {
		oneMoreRun=true;
		bufferNum=Math.floor(bufferNum)
	}
	let curTime=0
	if (panningObject) {
		console.log("panningObject true")
		MusRec=[]
		// argTypes MUST ALWAYS BE AN ARRAY, EVEN IF IT ONLY CONTAINS ONE ENTRY
		let changeVoice=Module.cwrap("setVoiceForRecording", "number", ["number"]) // function: rewinds track back to the beginning and mutes all voices except the voice specified in the argument.
		var totalVoices=Module.ccall(
			"getTotalVoices",
			"number"
		)
		console.log("getting intro length...")
		var introlength=Module.ccall("getIntroLength","number") // if I place this at the bottom, it errors
		console.log("totalVoices: "+totalVoices)
		// make the getVoiceName() function go out of scope when it is no longer needed
		let getVoiceName=Module.cwrap("getVoiceName", "string", ["number"])
		var VoiceDict=[] // holds the name and voice num of each voice.
		for (let i=0; i<totalVoices; i++) {
			VoiceDict[i]=getVoiceName(i)
		}
		console.log(VoiceDict)
		let toMusRecOther=[] // contains the number of each channel that is not in panningObject.
		for (let voice=0; voice<totalVoices; voice++) {
			if (panningObject[VoiceDict[voice]]) {
				console.log("voice: "+voice)
				MusRec[voice]=new Float32Array(totalSamples)
				changeVoice(voice)
				for (let i=0; i<bufferNum; i++) {
					let bufPtr=playMus()
					for(let i2=0; i2<bufferSize; i2++){
						MusRec[voice][i2+i*bufferSize]= Module.getValue(bufPtr+i2 * 2 * 2 + /* frame offset * bytes per sample * num channels + */ 0 * 2  /* channel offset * bytes per sample */, 'i16') / INT16_MAX /* convert int16 to float*/ 
					}
				}
			} else {
				toMusRecOther.push(voice)
			}
		}
		console.log("curTime: "+getTime())
		console.log(MusRec)
		console.log(MusRec.length)
		console.log(toMusRecOther)
		var MusRecOther=[] // contains sample data of every voice not in panningObject. Each voice is NOT in its own index, MusRecOther is an array of floating point samples.
		let unmuteVoice=Module.cwrap("unmuteVoice", "number", ["number"])
		changeVoice(toMusRecOther[0])
		console.log("toMusRecOther[0]: "+toMusRecOther[0])
		for (let i=0; i<totalVoices; i++) {
			if (toMusRecOther.includes(i)) {
				unmuteVoice(i)
			}
		}
		
		for (let i=0; i<bufferNum; i++) {
			let bufPtr=playMus()
			for(let i2=0; i2<bufferSize; i2++){
				MusRecOther[i2+i*bufferSize]= Module.getValue(bufPtr+i2 * 2 * 2/*numchannels*/ + /* frame offset * bytes per sample * num channels + */ 0 * 2  /* channel offset * bytes per sample */, 'i16') / INT16_MAX /* convert int16 to float*/ 
			}
			curTime=getTime()
		}
		console.log("curTime: "+getTime())
		console.log("MusRecOther")
		console.log(MusRecOther)
		
	} else { // no panningObject
		
		var system=Module.ccall("getSystem", "string")
		console.log("system: "+system)
		var monobool=SystemMonoList.includes(system)
		if (monobool) { // system is mono
			console.log("system is mono")
			MusRec= new Float32Array(totalSamples) 
			
			for (let i=0; i<bufferNum; i++) {
			// math.ceil((musLength * sampleRate/1000) / 2048) ?
			// math.floor((musLength * sampleRate/1000) / 2048), and then one extra playMus call to get the last few samples without using the whole 2048 buffer.
			// sample rate is the number of samples per second
				let bufPtr=playMus()
				for(let i2=0; i2<bufferSize; i2++){ // j<bufferSize && MusRec.length < (total samples: musLength * sampleRate/1000) ?
					MusRec[i2+i*bufferSize]= Module.getValue(bufPtr+i2 * 2 * 2 + /* frame offset * bytes per sample * num channels + */ 0 * 2  /* channel offset * bytes per sample */, 'i16') / INT16_MAX /* convert int16 to float*/
				}
			}
			if (oneMoreRun) {
				let bufPtr=playMus()
				for(let i2=0; i2+bufferNum*bufferSize<totalSamples; i2++){ // j<bufferSize && MusRec.length < (total samples: musLength * sampleRate/1000) ?
					MusRec[i2+bufferNum*bufferSize]= Module.getValue(bufPtr+i2 * 2 * 2 + /* frame offset * bytes per sample * num channels + */ 0 * 2  /* channel offset * bytes per sample */, 'i16') / INT16_MAX /* convert int16 to float*/ 
				}
			}
		} else { // system is stereo
			console.log("system is stereo")
			MusRec=[]
			MusRec[0]=new Float32Array(totalSamples) // left stereo channel
			MusRec[1]=new Float32Array(totalSamples) // right stereo channel
			for (let i=0; i<bufferNum; i++) {
				let bufPtr=playMus()
				for (let channel=0; channel<2; channel++) {
					for(let i2=0; i2<bufferSize; i2++){
						MusRec[channel][i2+i*bufferSize]= Module.getValue(bufPtr+i2 * 2 * 2 + /* frame offset * bytes per sample * num channels + */ channel * 2  /* channel offset * bytes per sample */, 'i16') / INT16_MAX /* convert int16 to float*/ 
					}
					
				}
			}
			if (oneMoreRun) {
				let bufPtr=playMus()
				for (let channel=0; channel<2; channel++) {
					for(let i2=0; i2+bufferNum*bufferSize<totalSamples; i2++){ // j<bufferSize && MusRec.length < (total samples: musLength * sampleRate/1000) ?
						MusRec[channel][i2+bufferNum*bufferSize]= Module.getValue(bufPtr+i2 * 2 * 2 + /* frame offset * bytes per sample * num channels + */ 0 * 2  /* channel offset * bytes per sample */, 'i16') / INT16_MAX /* convert int16 to float*/ 
					}
				}
			}
		}
		console.log("curTime: "+getTime())
	}
	console.log("Posting message back to main script");
	postMessage([MusRec, musLength, monobool, totalVoices, MusRecOther, VoiceDict, introlength]);
}