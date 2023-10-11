importScripts("Web-GME-PlayerO0.js");
importScripts("gmeplay-function.js");

var globalData;

let counter=0;

Module['onRuntimeInitialized'] = function() {
	console.log('emscripten initialized')
	counter++
	if (counter===2) {
		workerStart()
	}
}

onmessage = function(e) {
	console.log("Message received from main script");
	globalData=e.data
	counter++
	if (counter===2) {
		workerStart()
	}
};

function workerStart(){
	FS.writeFile('/home/web_user/input', globalData[0]);
	Module.ccall(
		"setupMusStereo", // Sets up everything needed to play music in the c code;
		"number",
		["number", "number", "number"],
		[BUFFERSIZE, globalData[1], SAMPLERATE]
	)
	GMEgenSamples(globalData[0], globalData[1], globalData[2], globalData[3], globalData[4], globalData[5], globalData[6], globalData[7], globalData[8]).then((MusRec) => {
		// Module.ccall("GMEend"); FS.unlink("/home/web_user/input"); /*delete file*/
		postMessage(MusRec); // make this a transferable?
	})
}