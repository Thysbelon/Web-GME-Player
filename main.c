// development on hold until gme 0.6.4, which should make multichannel better
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#include <gme.h>
#include <emscripten/emscripten.h>

//#include <math.h> //for sin

void handle_error( const char* str );
/*draft*/
// javascript ccall program flow:
// generatePCMfileAndReturnInfo (use multi channel if panning?)
// if onceInPage: emscripten_force_exit

static const uint16_t SAMPLE_RATE=44100;

static bool stereo;
static bool multitrack=false;
static Music_Emu* emu;

void createNewEmu(const unsigned int newSampleRate, bool multichannel) {
	gme_type_t file_type;
	gme_identify_file( "/home/web_user/input", &file_type ); //?
	if (file_type == gme_ay_type || file_type == gme_kss_type || file_type == gme_nsf_type || file_type == gme_nsfe_type || file_type == gme_sap_type ) {
		stereo=false;
	} else {
		stereo=true;
	}
	// idea:
	//switch(*file_type) {
	//	case *gme_ay_type:
	//	case *gme_kss_type:
	//	case *gme_nsf_type:
	//	case *gme_nsfe_type:
	//	case *gme_sap_type:
	//		stereo=false; break;
	//	default: stereo=true;
	//}
	emu = multichannel ? gme_new_emu_multi_channel( file_type, newSampleRate ) : gme_new_emu( file_type, newSampleRate );
	handle_error( gme_load_file( emu, "/home/web_user/input" ) );
	multitrack=gme_type_multitrack( file_type );
}

EMSCRIPTEN_KEEPALIVE
void endEmscripten() {
	emscripten_force_exit(0);
}

EMSCRIPTEN_KEEPALIVE
char* generatePCMfileAndReturnInfo(int track, uint8_t speed /*not sure if there is a use case for making this a float*/, bool diffEmu /*determines whether previous emu will be discarded, should be true both when a different file is being used or panning has been switched to on/off */, bool multichannel, bool onceInPage) {
	// speed: 50 is half speed (slow). 200 is twice the speed (fast). 100 is no change in speed.
	// to do: add a length input? (to only render a few seconds, useful for testing); discard half of buffer if stereo is false and no multichannel
	const unsigned int newSampleRate=((float)SAMPLE_RATE/speed)*100;
	if ( multitrack ) { // if an emulator exists (multitrack is false by default, if its 'true' that means an emulator has already been made)
		printf("An emulator already exists.\n");
		if (diffEmu) {
			printf("diffEmu is true. Deleting previous emulator...\n");
			gme_delete( emu );
			createNewEmu(newSampleRate, multichannel);
		}
	} else {
		printf("An emulator does not already exist.\n");
		createNewEmu(newSampleRate, multichannel);
	}
	
	gme_info_t* info;
	gme_track_info( emu, &info, track );
	int length=info->length;
	if (length == -1) {
		printf("file length is undefined, try adding intro_length and loop_length\n");
		length = info->intro_length + info->loop_length;
		printf("new length: %d\n", length);
		if (length == -2) {
			printf("intro length and loop length were both undefined. setting to 150000\n");
			length = 150000;
			printf("new length: %d\n", length);
		}
	}
	int loopStart=info->intro_length;
	printf("current emulator is %s\n", info->system);
	gme_free_info(info);
	
	// start track and write samples to file here.
	handle_error( gme_start_track( emu, track ) );
	int8_t totalVoices=gme_voice_count( emu ); //?
	printf("totalVoices: %d\n", totalVoices );
	const uint16_t framesPerBuffer=multichannel ? 64 : 1024; // maybe framesPerBuffer and bufferSize should stay between runs of a multitrack file
	printf("framesPerBuffer: %d\n", framesPerBuffer );
	const uint16_t bufferSize=multichannel ? (framesPerBuffer /*frames*/ * totalVoices * 2 /*channels*/) : (framesPerBuffer * 2 /*channels*/); // a frame is a group of one sample for each instrument; it is a single moment in time.
	// notes on gme 0.6.3 multichannel:
	// the multichannel bufferSize must be a minimum of 16, even if the number of voices * 2 channels is less than that. Using a small bufferSize like 16 is also extremely slow.
	// when the bufferSize is at the minimum of 16, the structure of the samples is: [frame 1 voice 1 left, frame 1 voice 1 right, frame 1 voice 2 left, frame 1 voice 2 right, frame 1 voice 3 left, frame 1 voice 3 right...] (there will be blank spaces for unused areas of the buffer.)
	// when the bufferSize is above the minimum, the structure of the samples is: [frame 1 voice 1 left, frame 1 voice 1 right, frame 2 voice 1 left, frame 2 voice 1 right, frame 1 voice 2 left, frame 1 voice 2 right, frame 2 voice 2 left, frame 2 voice 2 right, frame 1 voice 3 left, frame 1 voice 3 right, frame 2 voice 3 left, frame 2 voice 3 right, (blank spaces)..., frame 3 voice 1 left...] // each voice is grouped in 2 frames.
	printf("bufferSize: %d\n", bufferSize );
	const unsigned int totalFrames=(length * newSampleRate) / 1000;
	printf("(length %d * newSampleRate %i) / 1000: totalFrames %i\n", length, newSampleRate, totalFrames);
	printf("starting emulation...\n");
	FILE* pcmOut;
	pcmOut=fopen("pcmOut.raw", "wb");
	for (int i=0; i*framesPerBuffer<totalFrames; ++i) {
		short buf[bufferSize]; // array of int 16
		gme_play(emu, bufferSize, buf);
		unsigned int totalFramesLeft= totalFrames - i * bufferSize;
		unsigned int numOfFramesToWrite = (bufferSize > totalFramesLeft) ? totalFramesLeft : bufferSize;
		fwrite(buf, 2, numOfFramesToWrite, pcmOut);
	}
	fclose(pcmOut);
	printf("emulation done.\n");
	
	length= /*length/(speed/100)*/ ((float)length/speed)*100; // speed adjusted length for javascript audiobuffers and nodes
	// max length string (could be reduced slightly with hex): "2147483647, 2147483647, 0, 13, Square 1, Square 2, Triangle, Noise, DMC, Wave 1, Wave 2, Wave 3, Wave 4, Wave 5, Wave 6, Wave 7, Wave 8"
	//const uint8_t trackInfoSize= multichannel ? 135 : 25;
	const uint8_t trackInfoSize= multichannel ? 136 : 26; // the null terminator is a character.
	char trackInfo[trackInfoSize]; // information that js will need to gen audiobuffers and nodes
	snprintf( trackInfo, trackInfoSize, "%d, %d, %d", length, loopStart, stereo );
	if (multichannel) {
		char tempTotalVoices[5]; // the null terminator is a character.
		snprintf( tempTotalVoices, 5, ", %i", totalVoices );
		strcat( trackInfo, tempTotalVoices );
		for (int i=0;i<totalVoices;++i) {
			strcat( trackInfo, ", " );
			strcat( trackInfo, gme_voice_name( emu, i ) );
		}
	}
	
	if (!multitrack) {gme_delete( emu );}
	
	//if (onceInPage) {emscripten_force_exit(0);} // I believe trackInfo should still be returned to JS. If not, we can write trackInfo to another file.
	// WARNING: the pcm file will probably deleted after emscripten_force_exit is called.
	
	return trackInfo; // Wreturn-stack-address shouldn't be an issue because this is going straight to JavaScript.
}

void handle_error( const char* str )
{
	if ( str )
	{
		printf( "Error: %s\n", str ); //getchar();
		//exit( EXIT_FAILURE );
	}
}