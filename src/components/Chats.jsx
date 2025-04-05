import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";

export default function Chats() {
  const [chats, setChats] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mainUser, setMainUser] = useState("");
  const [mediaFiles, setMediaFiles] = useState({});
  const [searchText, setSearchText] = useState("");
  const [matchedMessages, setMatchedMessages] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const messageRefs = useRef({}); // for scrolling


  const chatTopRef = useRef(null);

  useEffect(() => {
    if (!currentChat || searchText.trim() === "") {
      setMatchedMessages([]);
      setCurrentMatchIndex(0);
      return;
    }

    const matches = [];
    currentChat.allMessages.forEach((msg, index) => {
      if (msg.text.toLowerCase().includes(searchText.toLowerCase())) {
        matches.push({ messageId: msg.id });
      }
    });

    setMatchedMessages(matches);
    setCurrentMatchIndex(matches.length > 0 ? 1 : 0);
  }, [searchText, currentChat]);


  useEffect(() => {
    if (matchedMessages.length > 0 && currentMatchIndex > 0) {
      const targetId = matchedMessages[currentMatchIndex - 1].messageId;
      const targetElement = messageRefs.current[targetId];
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentMatchIndex, matchedMessages, currentChat]);

  
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const zip = await JSZip.loadAsync(file);
      const chatFiles = Object.keys(zip.files).filter(
        (filename) => filename.endsWith(".txt") && !zip.files[filename].dir
      );

      if (chatFiles.length === 0) {
        alert("No .txt chat files found in the zip.");
        return;
      }

      const extractedMedia = {};
      for (const filename of Object.keys(zip.files)) {
        if (!zip.files[filename].dir && !filename.endsWith(".txt")) {
          const blob = await zip.files[filename].async("blob");
          const url = URL.createObjectURL(blob);
          extractedMedia[filename.split("/").pop()] = url; // Store by base filename
        }
      }
      setMediaFiles(extractedMedia);

      const parsedChats = [];

      for (const chatFile of chatFiles) {
        const content = await zip.files[chatFile].async("string");
        const lines = content.split("\n").filter(Boolean);

        const chatName = chatFile.replace(".txt", "").split("/").pop();

        // Try to extract contact name from first line if possible
        let contactName = chatName;
        if (lines[0] && lines[0].includes("WhatsApp Chat with")) {
          contactName = lines[0].replace("WhatsApp Chat with", "").trim();
          lines.shift(); // Remove the first line
        }

        const messages = [];
        lines.forEach((line, index) => {
          const androidRegex =
            /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(.*?)[\]|\s]-\s(.*?):\s(.*)$/;
          const iosRegex =
            /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?\s?[APap][Mm])\]\s(.+?):\s([\s\S]*)$/;

          let match = line.match(androidRegex) || line.match(iosRegex);

          if (match) {
            // new message
            messages.push({
              id: messages.length,
              date: match[1],
              time: match[2],
              sender: match[3],
              text: match[4].replace(/\s?\(file attached\)$/, "").trim(),
              timestamp: new Date(`${match[1]} ${match[2]}`).getTime(),
            });
          } else if (messages.length > 0 && line.startsWith(" ")) {
            // Only lines starting with space will be treated as continuation
            messages[messages.length - 1].text += "\n" + line.trim();
          } else if (
            messages.length > 0 &&
            !/^\[\d{1,2}\/\d{1,2}\/\d{2,4},/.test(line)
          ) {
            // Optionally, you can accept lines that clearly look like wrapped lines
            messages[messages.length - 1].text += "\n" + line.trim();
          } else {
            // Treat it as a standalone ignored line, OR skip it silently
            // (Optional: log ignored lines)
          }

          // else {
          //   // first lines without date, treat as system or info message
          //   messages.push({
          //     id: messages.length,
          //     date: "",
          //     time: "",
          //     sender: "System",
          //     text: line.trim(),
          //     timestamp: Date.now(),
          //   });
          // }
        });

        // Get unique senders
        const uniqueSenders = [...new Set(messages.map((msg) => msg.sender))];

        // Group messages by date
        const messagesByDate = messages.reduce((acc, msg) => {
          const date = msg.date;
          if (!acc[date]) {
            acc[date] = [];
          }
          acc[date].push(msg);
          return acc;
        }, {});

        parsedChats.push({
          id: chatName,
          name: contactName,
          messagesByDate,
          lastMessage: messages[messages.length - 1],
          allMessages: messages,
          uniqueSenders,
        });
      }

      // Collect all unique senders across all chats
      const allSenders = new Set();
      parsedChats.forEach((chat) => {
        chat.uniqueSenders.forEach((sender) => {
          allSenders.add(sender);
        });
      });

      // Convert to array for the prompt
      const sendersList = [...allSenders];

      // Prompt user to select their username
      if (sendersList.length > 0) {
        // Create a message for the alert
        let message =
          "Select your username from the list by entering the corresponding number:\n\n";
        sendersList.forEach((sender, index) => {
          message += `${index + 1}. ${sender}\n`;
        });

        // Show the prompt and get user selection
        const selection = prompt(message);

        if (selection !== null) {
          const selectionIndex = parseInt(selection, 10) - 1;
          if (
            !isNaN(selectionIndex) &&
            selectionIndex >= 0 &&
            selectionIndex < sendersList.length
          ) {
            setMainUser(sendersList[selectionIndex]);
          } else {
            alert("Invalid selection. Using auto-detection as fallback.");
            // Fall back to most frequent sender in first chat
            autoDetectMainUser(parsedChats[0]);
          }
        } else {
          // User cancelled the prompt
          alert("No user selected. Using auto-detection as fallback.");
          autoDetectMainUser(parsedChats[0]);
        }
      }

      setChats(parsedChats);
      if (parsedChats.length > 0) {
        setCurrentChat(parsedChats[0]);
      }

      const cloudName = "de7vaylb1"; // <--- change this
      const uploadPreset = "whatsapp_media"; // <--- change this

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      try {
        const cloudinaryResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!cloudinaryResponse.ok) {
          return;
        }

        const cloudinaryData = await cloudinaryResponse.json();
      } catch (err) {}
    } catch (error) {
      console.error("Error parsing zip file:", error);
      alert(
        "Error parsing the chat file. Please make sure it's a valid WhatsApp export."
      );
    }
  };

  // Function to auto-detect the main user based on frequency
  const autoDetectMainUser = (chat) => {
    const senderFrequency = {};
    chat.allMessages.forEach((msg) => {
      if (!senderFrequency[msg.sender]) {
        senderFrequency[msg.sender] = 0;
      }
      senderFrequency[msg.sender]++;
    });

    // Find the sender with the highest frequency
    let detectedMainUser = "";
    let maxFrequency = 0;

    for (const [sender, frequency] of Object.entries(senderFrequency)) {
      if (frequency > maxFrequency) {
        maxFrequency = frequency;
        detectedMainUser = sender;
      }
    }

    setMainUser(detectedMainUser);
  };

  useEffect(() => {
    // Scroll to the top (most recent messages) when a chat is selected
    chatTopRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentChat]);

  const formatTime = (timeStr) => {
    try {
      // Convert to 12-hour format with AM/PM
      const [hours, minutes] = timeStr.split(":");
      const hour = parseInt(hours, 10);
      // const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return `${hour12}:${minutes} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };

  // Check if a message is from the main user
  const isFromMainUser = (senderName) => {
    return senderName === mainUser;
  };

  const getMediaUrlAndType = (msg) => {
    let cleanText = msg.text.replace(/[\u200e\u202a\u202c]/g, "");

    let extractedFileName = "";

    // iOS format
    const iosMatch = cleanText.match(/<attached:\s*([^>]+)>/);
    if (iosMatch) {
        extractedFileName = iosMatch[1].trim();
    }

    // Android format
    const androidMatch = cleanText.match(/([A-Za-z0-9\-_]+\.(jpg|jpeg|png|gif|mp4|mov|opus|ogg|mp3|pdf|doc|xls|webm))\s?\(file attached\)/i);
    if (androidMatch) {
        extractedFileName = androidMatch[1].trim();
    }

    // fallback if only filename
    if (!extractedFileName && cleanText.match(/\.(jpg|jpeg|png|gif|mp4|mov|opus|ogg|mp3|pdf|doc|xls|webm)$/i)) {
        extractedFileName = cleanText.trim();
    }

    if (!extractedFileName) return { type: "text", url: null };

    // remove numeric prefixes like 00000063- (optional)
    extractedFileName = extractedFileName.replace(/^\d+-/, "");

    // find matching media file
    const possibleKeys = Object.keys(mediaFiles).filter((key) =>
        key.toLowerCase().includes(extractedFileName.toLowerCase())
    );

    if (possibleKeys.length === 0) return { type: "text", url: null };

    const fileName = possibleKeys[0];
    const fileUrl = mediaFiles[fileName];

    // detect type
    if (fileName.match(/\.(jpg|jpeg|png|gif)$/i))
        return { type: "image", url: fileUrl };
    if (fileName.match(/\.(opus|ogg|mp3)$/i))
        return { type: "audio", url: fileUrl };
    if (fileName.match(/\.(mp4|mov|webm)$/i))
        return { type: "video", url: fileUrl };
    return { type: "document", url: fileUrl };
};


  return (
    <div className="h-screen w-full flex flex-col bg-[#111B21] overflow-hidden">
      {/* Header */}
      <div className="h-16 bg-[#202C33] flex items-center px-4 text-white">
        <div className="flex items-center space-x-4">
          <div className="font-bold text-lg">WhatsApp Chat Reader</div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          <input
            type="text"
            placeholder="Search messages..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="px-2 py-1 rounded-md text-black text-sm w-64"
          />
          {matchedMessages.length > 0 && (
            <>
              <button
                onClick={() =>
                  setCurrentMatchIndex((prev) =>
                    prev > 1 ? prev - 1 : matchedMessages.length
                  )
                }
                className="text-xs bg-[#374248] hover:bg-[#465259] px-2 py-1 rounded"
              >
                ↑
              </button>
              <span className="text-xs">
                {currentMatchIndex}/{matchedMessages.length}
              </span>
              <button
                onClick={() =>
                  setCurrentMatchIndex((prev) =>
                    prev < matchedMessages.length ? prev + 1 : 1
                  )
                }
                className="text-xs bg-[#374248] hover:bg-[#465259] px-2 py-1 rounded"
              >
                ↓
              </button>
            </>
          )}
        </div>

        
        <div className="ml-auto flex items-center">
          {mainUser && (
            <div className="mr-4 text-sm text-[#8696A0]">
              Primary User:{" "}
              <span className="text-[#00A884] font-medium">{mainUser}</span>
            </div>
          )}
          <label className="flex items-center cursor-pointer bg-[#00A884] hover:bg-[#02735E] text-white py-2 px-4 rounded-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span>Upload Chat</span>
            <input
              type="file"
              accept=".zip"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col relative">
          {/* Chat Wallpaper */}
          <div className="absolute inset-0 bg-[url('/whatsapp-bg.png')] bg-repeat opacity-10"></div>

          {currentChat ? (
            <>
              {/* Chat Header */}
              <div className="h-16 bg-[#202C33] flex items-center px-4 z-10 border-l border-[#222E35]">
                <button
                  className="md:hidden mr-2 text-[#8696A0]"
                  onClick={() => setShowSidebar(!showSidebar)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <div className="h-10 w-10 rounded-full bg-[#00A884] flex items-center justify-center text-white font-bold">
                  {currentChat.name.charAt(0).toUpperCase()}
                </div>
                <div className="ml-3">
                  <div className="font-semibold text-white">
                    {currentChat.name}
                  </div>
                  <div className="text-xs text-[#8696A0]">
                    {mainUser
                      ? `Primary user: ${mainUser}`
                      : "No primary user selected"}
                  </div>
                </div>
                <button
                  className="ml-auto text-[#8696A0] hover:text-white"
                  onClick={() => {
                    // Create a numbered list of unique senders in the current chat
                    const sendersList = currentChat.uniqueSenders;
                    let message =
                      "Select your username from the list by entering the corresponding number:\n\n";
                    sendersList.forEach((sender, index) => {
                      message += `${index + 1}. ${sender}\n`;
                    });

                    const selection = prompt(message);
                    if (selection !== null) {
                      const selectionIndex = parseInt(selection, 10) - 1;
                      if (
                        !isNaN(selectionIndex) &&
                        selectionIndex >= 0 &&
                        selectionIndex < sendersList.length
                      ) {
                        setMainUser(sendersList[selectionIndex]);
                      } else {
                        alert("Invalid selection. Primary user not changed.");
                      }
                    }
                  }}
                >
                  <div className="flex items-center bg-[#374248] hover:bg-[#465259] px-3 py-1 rounded-md">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span className="text-xs">Change User</span>
                  </div>
                </button>
              </div>

              {/* Messages Area - Display in reverse order (newest on top) */}
              <div className="flex-1 overflow-y-auto p-4 z-0 relative flex flex-col-reverse">
                <div ref={chatTopRef} />

                {Object.entries(currentChat.messagesByDate)
                  .reverse()
                  .map(([date, messages]) => (
                    <div key={date}>
                      <div className="flex justify-center my-3">
                        <div className="bg-[#182229] text-[#8696A0] text-xs px-3 py-1 rounded-lg">
                          {date}
                        </div>
                      </div>

                      {messages.slice().map((msg) => {
                        // Determine if message is from the main user
                        const isUserMessage = isFromMainUser(msg.sender);
                        const isMatched = matchedMessages.some((m) => m.messageId === msg.id);
                        const highlightedText = searchText
                          ? msg.text.split(new RegExp(`(${searchText})`, "gi")).map((part, i) =>
                            part.toLowerCase() === searchText.toLowerCase() ? (
                              <mark key={i} className="bg-yellow-300 text-black px-1 rounded">
                                {part}
                              </mark>
                            ) : (
                              part
                            )
                          )
                          : msg.text;

                        return (
                          <div
                            key={msg.id}
                            ref={(el) => {
                              if (el) messageRefs.current[msg.id] = el;
                            }}
                            className={`flex mb-2 ${
                              isUserMessage ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`relative max-w-[65%] break-words p-2 rounded-lg ${
                                isUserMessage
                                  ? "bg-[#005C4B] text-white rounded-tr-none"
                                  : "bg-[#202C33] text-white rounded-tl-none"
                                } ${isMatched ? "ring-2 ring-yellow-400" : ""}`}
                            >
                              {!isUserMessage && (
                                <div className="text-[#00A884] font-medium text-sm">
                                  {msg.sender}
                                </div>
                              )}
                              <div className="text-sm whitespace-pre-wrap">
                                {(() => {
                                  const { type, url } = getMediaUrlAndType(msg);

                                  if (type === "image")
                                    return (
                                      <img
                                        src={url}
                                        alt="Image"
                                        className="rounded-lg max-w-96 mt-2"
                                      />
                                    );
                                  if (type === "audio")
                                    return (
                                      <audio
                                        controls
                                        src={url}
                                        className="mt-2 w-full"
                                      />
                                    );
                                  if (type === "video")
                                    return (
                                      <video
                                        controls
                                        src={url}
                                        className="rounded-lg max-w-96 mt-2"
                                      />
                                    );
                                  if (type === "document")
                                    return (
                                      <a
                                        href={url}
                                        download
                                        className="text-blue-400 underline mt-2 block"
                                      >
                                        Download {msg.text}
                                      </a>
                                    );

                                  return  searchText == '' && linkify(msg.text)
                                })()}
                              </div>

                              {
                                searchText !== '' &&
                                <div className="text-sm whitespace-pre-wrap">{highlightedText}</div>
                              }

                              <div className="text-[10px] text-[#8696A0] mt-1 text-right flex items-center justify-end">
                                {formatTime(msg.time)}
                                {isUserMessage && (
                                  <svg
                                    className="w-3 h-3 ml-1 text-[#8696A0]"
                                    viewBox="0 0 16 11"
                                    fill="currentColor"
                                  >
                                    <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.686.025.538.538 0 0 0 .052.717l2.713 2.568c.102.076.229.127.381.127.127 0 .254-.051.356-.153L11.122 1.1a.524.524 0 0 0 .025-.677l-.076-.076z" />
                                  </svg>
                                )}
                              </div>

                              {/* Message triangle */}
                              <div
                                className={`absolute top-0 w-0 h-0 border-8 ${
                                  isUserMessage
                                    ? "right-0 border-[#005C4B] border-r-transparent border-t-transparent border-b-[#005C4B]"
                                    : "left-0 border-[#202C33] border-l-transparent border-t-transparent border-b-[#202C33]"
                                }`}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-[#8696A0] z-10">
              {chats.length > 0 ? (
                <div className="text-center">
                  <p>Select a chat to view messages</p>
                </div>
              ) : (
                <div className="text-center p-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#00A884] flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-8 w-8 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">
                    WhatsApp Chat Viewer
                  </h2>
                  <p>Upload a WhatsApp chat export zip file to get started</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline break-all"
        >
          {part}
        </a>
      );
    } else {
      return part;
    }
  });
}
