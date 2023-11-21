importScripts("Web-GME-Player.js");
importScripts("gmeplay-function.js");
// USE CHROME TO DEBUG WORKER ERRORS. FIREFOX DOESN'T DISPLAY ANY ERROR MESSAGES!!!!

var globalData;

let counter=0;

console.log('worker alive');
onmessage = function(e) {
	console.log("Message received from main script");
	globalData=e.data
	counter++
	if (counter===2) {
		workerStart()
	}
};

createGMEmodule().then((result) => {
	gmeModule=result
	GMEend=gmeModule.cwrap("GMEend", "number", null)
	counter++
	if (counter===2) {
		workerStart()
	}
})

function workerStart(){
	gmeModule.FS.writeFile('/home/web_user/input', globalData[5]);
	gmeModule.ccall(
		"setupMusStereo", // Sets up everything needed to play music in the c code;
		"number",
		["number", "number"],
		[globalData[6], SAMPLERATE/globalData[0].speed]
	)
	GMEgenSamples(globalData[0], globalData[1], globalData[2], globalData[3], globalData[4], globalData[5], globalData[6]).then((MusRec) => {
		postMessage(MusRec); // to do: make this a transferable?
	})
}