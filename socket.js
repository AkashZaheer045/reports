let { io } = require('./../../../../app.js')
const chatService = require('./../services/chat.js')
var socketAuth = require('./../../../../middleware/socketAuth.js')
const commonService = require('../../common/services/common');
const pushService = require('../../../../helpers/push');
const notifications = require('../../../../config/notifications.json');
const constants = require('../../../../config/constants.json');
const activityLogServices = require('../../activity_logs/services/activity_logs');
const userService = require('../../users/services/users');
const serviceServices = require('../../service/services/service.js')
const mandoobServices = require('../../mandoobs/services/mandoob');
const { getUserLanguage } = require('../../../../helpers/common');
let connectedUsers = []
// {
//     user_id,
//         socket_id,
//         role,
//         name,
//         status,
//         date
// }

// Function to broadcast pending requests to all admins
const broadcastPendingRequests = async () => {
    try {
        let [pendingRequests, err] = await chatService.getPendingUserRequests();
        if (err) {
            console.error('Error fetching pending requests:', err);
            return;
        }

        // Broadcast to admin room
        io.to('admin_room').emit('pending_requests_update', {
            count: pendingRequests.count,
            requests: pendingRequests.rows,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error in broadcastPendingRequests:', error);
    }
};

// MAIN SOCKET CONNECTION
io.use(socketAuth.auth).on('connection', async (socket) => {
    try {
        // io.on('connection', async (socket) => {
        console.log("Total Connected Sockets : " + io.engine.clientsCount);
        // console.log("Rooms: ", socket.adapter.rooms);
        // console.log('io.sockets.adapter.rooms:', io.sockets.adapter.rooms);
        console.log('Threads:', Array.from(io.sockets.adapter.rooms.keys()).filter(room => typeof (room) == "number"));

        console.log('Active Thread Rooms:', Array.from(io.sockets.adapter.rooms.keys()).filter(room => typeof (room) == "number"));

        // Set user status to online
        try {
            await chatService.setOnlineStatus({ status: '1', userId: socket.appUser?.id, userType: socket.userType })
        } catch (statusError) {
            console.error('❌ Error setting online status:', statusError);
            socket.emit("ERROR", "Failed to update online status");
        }

        if (socket.userRole == 'admin' || socket.userRole == 'super_admin' || socket.userRole == 'moderator') {
            try {
                // Join admin room for pending requests broadcasts
                socket.join('admin_room');

                let [threads, error] = await chatService.getAllThreadWithParticipant({ type: "support" }, { userType: ["admin", "super_admin", "moderator"], userId: socket.appUser?.id });

                if (error) {
                    socket.emit("ERROR", error);
                    console.error('Admin threads error:', error);
                    return;
                }

                for (const thread of threads) {
                    socket.join(thread.id);

                    // send user status active to other users
                    io.in(thread.id).emit('admin_connected', socket.appUser);
                }

            } catch (adminError) {
                console.error('❌ Error in admin connection setup:', adminError);
                socket.emit("ERROR", "Admin connection setup failed");
            }

        } else {

            try {
                //Join its private rooms for regular users
                let [threads, error] = await chatService.getAllThreadWithParticipant({}, { userType: socket.userType, userId: socket.appUser?.id });

                if (error) {
                    socket.emit("ERROR", error);
                    console.error('User threads error:', error);
                    return;
                }

                for (const thread of threads) {
                    socket.join(thread.id);

                    // send user status active to other users
                    io.in(thread.id).emit('user_connected', socket.appUser);
                }

            } catch (userError) {
                console.error('❌ Error in user connection setup:', userError);
                socket.emit("ERROR", "User connection setup failed");
            }
        }

        // const threadRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(room => typeof room === "number");
        // for (const roomId of threadRooms) {
        //     const socketsInRoom = await io.in(roomId).fetchSockets();
        //     console.log(`🏠 Room ${roomId} has ${socketsInRoom.length} users:`);
        //     socketsInRoom.forEach(s => {
        //         console.log(`   - User ${s.appUser?.id} (${s.userType}) - Socket: ${s.id}`);
        //     });
        // }


        // ****************************************************
        // Manual refresh for pending requests (optional - if admin wants to force refresh)
        // ****************************************************
        socket.on('pending_requests_update', async (callback) => {
            try {
                if (socket.userRole == 'admin' || socket.userRole == 'super_admin' || socket.userRole == 'moderator') {
                    let [pendingRequests, err] = await chatService.getPendingUserRequests();
                    if (err) {
                        socket.emit("ERROR", err);
                        console.error(err);
                    } else {
                        // Broadcast to all admins
                        io.to('admin_room').emit('pending_requests_update', {
                            count: pendingRequests.count,
                            requests: pendingRequests.rows,
                            timestamp: new Date()
                        });

                        if (typeof callback === 'function') {
                            callback({ success: true, count: pendingRequests.count, request: pendingRequests.rows });
                        }
                    }
                }
            } catch (error) {
                console.error('Error in Chat refresh_pending_requests:', error);
                socket.emit("ERROR", "Socket error occurred");

                if (typeof callback === 'function') {
                    callback({ status: false, error: "pending_request error occurred" });
                }
            }
        });

        // when user/mandoob want to initiate chat with admin
        socket.on('join_thread', async (data, callback) => {
            try {
                let { threadId, type, bookingId } = data
                let thread = null, error = null; let threadParticipant = {}
                // get support thread of the user/mandoob

                let outerFilter = { type: type };
                if (threadId) { outerFilter.id = threadId; }
                if (bookingId) { outerFilter.bookingId = bookingId; }


                const result = await chatService.getThreadWithParticipant(outerFilter, { userId: socket.appUser.id, userType: socket.userType });
                [thread, error] = result;

                if (error) {
                    socket.emit("ERROR", error);
                    console.error(error);
                }
                // Check if the user exists in the list
                const exists = thread?.participants?.some((p) => p.dataValues.userId === socket.appUser.id);

                if (thread && exists) {
                    // join the room 

                    socket.join(thread.id)
                    socket.emit("join_thread_participant", thread);


                } else if (threadId && !thread) {
                    // Thread ID provided but user is not participant - get thread without user filter and add user
                    let [existingThread, tError] = await chatService.getThread(threadId);
                    if (tError) {
                        socket.emit("ERROR", tError);
                        console.error(tError);
                        return;
                    }

                    if (existingThread) {
                        socket.join(existingThread.id)
                        thread = existingThread

                        // CHECK IF PARTICIPANT ALREADY EXISTS BEFORE CREATING
                        let [existingParticipant, epErr] = await chatService.getParticipant(
                            thread.id,
                            socket.appUser.id,
                            socket.userType
                        );

                        if (epErr) {
                            socket.emit("ERROR", epErr);
                            console.error(epErr);
                            return;
                        }

                        if (!existingParticipant) {

                            let [chatParticipant, cpErr] = await chatService.createChatParticipants([{ userId: socket.appUser.id, userType: socket.userType, threadId: thread.id, isOwner: 0, joinedAt: new Date() }]);
                            if (cpErr) {
                                socket.emit("ERROR", cpErr);
                                console.error(cpErr);
                                return;
                            }

                            threadParticipant = { ...thread.dataValues, participants: chatParticipant };
                        } else {

                            threadParticipant = { ...thread.dataValues, participants: existingParticipant };
                        }

                        socket.emit("join_thread_participant", threadParticipant);

                        if (socket.userType === 'admin' || socket.userType === 'super_admin' || socket.userType === 'moderator') {
                            //first time only get user/mandoob message Status data for admin status log
                            let [messageStatus, msErr] = await chatService.getMessagesStatus(thread.id)
                            if (msErr) {
                                socket.emit("ERROR", msErr);
                                console.error(msErr);
                            }

                            if (messageStatus && messageStatus.length > 0) {
                                let msgsStatus = []
                                for (const status of messageStatus) {
                                    msgsStatus.push({
                                        threadId: status.threadId,
                                        userId: socket.appUser.id,
                                        userType: socket.userType,
                                        messageId: status.messageId,
                                        status: 2,
                                        isRead: '0',
                                        readAt: new Date()
                                    })
                                }
                                // bulk insert
                                let [messagesStatus, msError] = await chatService.bulkmessageStatusInsert(msgsStatus);
                                console.log('messagesStatus, msError:', messagesStatus, msError);

                                if (msError) {
                                    socket.emit("ERROR", msError);
                                    console.error(msError);
                                }
                            }

                            // Trigger pending requests update when admin joins a thread
                            broadcastPendingRequests();
                        }
                    }

                } else {
                    // create thread and add chat participatns
                    let [threadCreated, err] = await chatService.createThread({ type: "support" });
                    if (err) {
                        socket.emit("ERROR IN CREATING THREAD", err);
                        console.error(err);
                    }

                    if (threadCreated) {
                        socket.join(threadCreated.id)

                        let [existingParticipant, epErr] = await chatService.getParticipant(threadCreated.id, socket.appUser.id, socket.userType);
                        if (epErr) {
                            socket.emit("ERROR", epErr);
                            console.error(epErr);
                            return;
                        }

                        thread = threadCreated

                        if (!existingParticipant) {
                            // create thread participants
                            let [chatParticipant, cpErr] = await chatService.createChatParticipants([{ userId: socket.appUser.id, userType: socket.userType, threadId: thread.id, isOwner: 1, joinedAt: new Date() }]);
                            if (cpErr) {
                                socket.emit("ERROR", cpErr);
                                console.error(cpErr);
                            }

                            threadParticipant = { ...thread.dataValues, participants: chatParticipant };

                        } else {
                            threadParticipant = { ...thread.dataValues, participants: existingParticipant };
                        }
                        socket.emit("join_thread_participant", threadParticipant);

                    }
                }

                if (typeof callback === 'function') {
                    callback(thread)
                }


            } catch (error) {
                console.error('Error in Chat socket thread Join:', error);
                socket.emit("ERROR", "Socket error occurred");

                if (typeof callback === 'function') {
                    callback({ status: false, error: "Join_thread Socket error occurred" });
                }
            }
        })

        // on user message send : insert into the messages and emit it to others
        socket.on('send_message', async (data, callback) => {
            try {
                let { threadId, senderId, content, messageType, serviceId } = data
                let createActivityLogData = []

                // // DEBUG: Get all sockets in the target room
                // const roomSockets = await io.in(threadId).fetchSockets();
                // console.log('Sockets in room', threadId + ':', roomSockets.length);
                // roomSockets.forEach((s, i) => {
                //     console.log(`Socket ${i}: ${s.appUser?.id} (${s.userType})`);
                // });

                // Your existing validation code...
                data.senderType = (socket.userRole == "individual") || (socket.userRole == "corporate") ? "mandoob" : socket.userRole


                let [singlethread, tErr] = await chatService.getThread(threadId);
                if (tErr || !singlethread) {
                    socket.emit("ERROR", tErr || "Thread not found");
                    if (typeof callback === 'function') {
                        callback({ status: false, error: "Thread not found" });
                    }
                    return;
                }
                //restrictions only between mandoob and user and when not sending service
                if (singlethread?.type === "booking" && messageType !== "service") {
                    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
                    const phoneRegex = /\b\+?[0-9]{7,15}\b/;
                    if (emailRegex.test(content) || phoneRegex.test(content)) {
                        socket.emit('sensitive_message', 'Please do not share sensitive information like email addresses or phone numbers.');
                        return;
                    }
                }

                // // DEBUG: Check thread participants
                // console.log('Thread participants:', singlethread.participants.map(p => ({
                //     userId: p.userId, 
                //     userType: p.userType
                // })));

                // // DEBUG: Check if all participants have connected sockets
                // singlethread.participants.forEach(participant => {
                //     const participantSockets = Array.from(io.sockets.sockets.values())
                //         .filter(s => (s.appUser?.id || s.appUser?.dataValues?.id) === participant.userId && 
                //                     s.userType === participant.userType);
                //     console.log(`Participant ${participant.userId} (${participant.userType}): ${participantSockets.length} sockets`);
                //     participantSockets.forEach(pSocket => {
                //         console.log(`  - Socket ${pSocket.id} in rooms:`, Array.from(pSocket.rooms));
                //         console.log(`  - Is in target room ${threadId}:`, pSocket.rooms.has(threadId));
                //     });
                // });

                if (singlethread.type === "support") {
                    const assignedAdmin = singlethread.participants.find(p => p.userType === 'admin' || p.userType === 'super_admin' || p.userType === 'moderator');
                    if (socket.userRole === 'admin' || socket.userRole === 'super_admin' || socket.userRole === 'moderator') {
                        if (!assignedAdmin || assignedAdmin.userId !== socket.appUser.id) {
                            socket.emit("ERROR", "You are not assigned to this thread");
                            return;
                        }
                    }
                }

                // check if mandoob first sendming message to custommer send notification to customer also
                if ((data.senderType === 'admin' || data.senderType === 'super_admin' || data.senderType === 'moderator') && singlethread.type === "support") {
                    const participant = singlethread.participants.find(
                        (p) => p.userType === 'mandoob' || p.userType === 'user'
                    );
                    let title;
                    let message
                    if (participant) {
                        const userId = participant.userId;
                        let user, uErr;

                        if (participant.userType === 'mandoob') {
                            [user, uErr] = await mandoobServices.getUserWithId(userId);
                        } else if (participant.userType === 'user') {
                            [user, uErr] = await userService.getUserWithId(userId);
                        }

                        if (!uErr && user) {
                            // Get user language from DB
                            const userLanguage = await getUserLanguage(user, userId, participant.userType === 'mandoob' ? 'mandoob' : 'user');
                            
                            // Notification config
                            title = notifications.mandoob_notifications.new_admin_message.title[userLanguage];
                            message = notifications.mandoob_notifications.new_admin_message.content[userLanguage];
                            const titleEnMandoobAdmin = notifications.mandoob_notifications.new_admin_message.title['en'];
                            const titleArMandoobAdmin = notifications.mandoob_notifications.new_admin_message.title['ar'];
                            const titleUrMandoobAdmin = notifications.mandoob_notifications.new_admin_message.title['ur'];
                            const messageEnMandoobAdmin = notifications.mandoob_notifications.new_admin_message.content['en'];
                            const messageArMandoobAdmin = notifications.mandoob_notifications.new_admin_message.content['ar'];
                            const messageUrMandoobAdmin = notifications.mandoob_notifications.new_admin_message.content['ur'];

                            if (participant.userType == 'user') {
                                title = notifications.customer_notifications.support_message.title[userLanguage];
                                message = notifications.customer_notifications.support_message.content[userLanguage];
                                var titleEnSupport = notifications.customer_notifications.support_message.title['en'];
                                var titleArSupport = notifications.customer_notifications.support_message.title['ar'];
                                var titleUrSupport = notifications.customer_notifications.support_message.title['ur'];
                                var messageEnSupport = notifications.customer_notifications.support_message.content['en'];
                                var messageArSupport = notifications.customer_notifications.support_message.content['ar'];
                                var messageUrSupport = notifications.customer_notifications.support_message.content['ur'];
                            }

                            let [notification, nErr] = await commonService.createNotification({
                                userId: userId,
                                role: participant.userType === "mandoob" ? "mandoob" : "customer", // dynamic role
                                type: "chat",
                                title: title,
                                message: message,
                                titleEn: participant.userType === 'mandoob' ? titleEnMandoobAdmin : titleEnSupport,
                                titleAr: participant.userType === 'mandoob' ? titleArMandoobAdmin : titleArSupport,
                                titleUr: participant.userType === 'mandoob' ? titleUrMandoobAdmin : titleUrSupport,
                                messageEn: participant.userType === 'mandoob' ? messageEnMandoobAdmin : messageEnSupport,
                                messageAr: participant.userType === 'mandoob' ? messageArMandoobAdmin : messageArSupport,
                                messageUr: participant.userType === 'mandoob' ? messageUrMandoobAdmin : messageUrSupport,
                            });

                            if (nErr) {
                                console.error(nErr);
                            }

                            if (user.deviceInfo) {
                                pushService.send_push(
                                    null,
                                    null,
                                    user.deviceInfo.device_token,
                                    title,
                                    message,
                                    null,
                                    null,
                                    user.deviceInfo
                                );
                            }
                        }
                    }
                } else if (data.senderType == 'mandoob' && singlethread.type === "support") {
                    const payload = constants.activity_log_payload.message_sent_booking_chat_admin;

                    createActivityLogData.push({
                        performerId: socket.appUser.id,
                        performerName: socket.appUser.name,
                        performerRole: payload.performerRole,
                        entity: payload.entity,
                        entityId: threadId,
                        action: payload.action,
                        description: payload.description_en,
                        descriptionUr: payload.description_ur,
                        descriptionAr: payload.description_ar,
                        before: null,
                        after: null
                    });

                    const [activityLog, activityLogError] = await activityLogServices.bulkCreateActivityLogs(createActivityLogData);
                    if (activityLogError) {
                        console.error(activityLogError);
                    }

                    // Send notification to all admins when mandoob sends message in support thread
                    
                        const senderName = socket.appUser.name || 'Mandoob';
                        const titleEn = notifications.admin_notifications.new_mandoob_support_message.title['en'];
                        const titleAr = notifications.admin_notifications.new_mandoob_support_message.title['ar'];
                        const titleUr = notifications.admin_notifications.new_mandoob_support_message.title['ur'];
                        const messageEn = notifications.admin_notifications.new_mandoob_support_message.content['en'].replace('[Mandoob Name]', senderName);
                        const messageAr = notifications.admin_notifications.new_mandoob_support_message.content['ar'].replace('[Mandoob Name]', senderName);
                        const messageUr = notifications.admin_notifications.new_mandoob_support_message.content['ur'].replace('[Mandoob Name]', senderName);

                       
                            // Create notification for each admin
                            const [notification, nErr] = await commonService.createNotification({
                                userId: socket.appUser.id,
                                role: 'admin',
                                titleEn,
                                titleAr,
                                titleUr,
                                messageEn,
                                messageAr,
                                messageUr,
                                type: 'chat',
                                metaData: { mandoobName: senderName }
                            });
                            if (nErr) {
                                console.error("Error creating notification for admin:", nErr);
                            }

                            
                        
                    
                } else if (data.senderType === 'user' && singlethread.type === "support") {
                    // Send notification to all admins when customer sends message in support thread
                   
                        const senderName = socket.appUser.name || 'Customer';
                        const titleEn = notifications.admin_notifications.new_customer_support_message.title['en'];
                        const titleAr = notifications.admin_notifications.new_customer_support_message.title['ar'];
                        const titleUr = notifications.admin_notifications.new_customer_support_message.title['ur'];
                        const messageEn = notifications.admin_notifications.new_customer_support_message.content['en'].replace('[Customer Name]', senderName);
                        const messageAr = notifications.admin_notifications.new_customer_support_message.content['ar'].replace('[Customer Name]', senderName);
                        const messageUr = notifications.admin_notifications.new_customer_support_message.content['ur'].replace('[Customer Name]', senderName);

                        
                            // Create notification for each admin
                            const [notification, nErr] = await commonService.createNotification({
                                userId: socket.appUser.id,
                                role: 'admin',
                                titleEn,
                                titleAr,
                                titleUr,
                                messageEn,
                                messageAr,
                                messageUr,
                                type: 'chat',
                                metaData: { customerName: senderName }
                            });
                            if (nErr) {
                                console.error("Error creating notification for admin:", nErr);
                            }

                           
                        
                    
                }
                // check if mandoob first sendming message to custommer send notification to customer also
                if (data.senderType === 'mandoob' && singlethread.type === "booking") {
                    const userId = singlethread.participants.find(p => p.userType === 'user')?.userId
                    const [user, uErr] = await userService.getUserWithId(userId);
                    //   let  title =  notifications.customer_notifications.new_mandoob_message.title['en']
                    //   let  message =  notifications.customer_notifications.new_mandoob_message.content['en']
                    //send push notification to customer
                    const userLanguage = await getUserLanguage(user, userId, 'user');
                    const title = notifications.customer_notifications.new_mandoob_message.title[userLanguage];
                    const message = notifications.customer_notifications.new_mandoob_message.content[userLanguage];
                    const titleEn = notifications.customer_notifications.new_mandoob_message.title['en'];
                    const titleAr = notifications.customer_notifications.new_mandoob_message.title['ar'];
                    const titleUr = notifications.customer_notifications.new_mandoob_message.title['ur'];
                    const messageEn = notifications.customer_notifications.new_mandoob_message.content['en'];
                    const messageAr = notifications.customer_notifications.new_mandoob_message.content['ar'];
                    const messageUr = notifications.customer_notifications.new_mandoob_message.content['ur'];
                    //         // send notification to customer
                    let [notification, nErr] = await commonService.createNotification({
                        userId: userId,
                        titleEn,
                        titleAr,
                        titleUr,
                        messageEn,
                        messageAr,
                        messageUr,
                        role: 'customer',
                        title: title,
                        message: message,
                        type: 'chat',
                        referenceId: threadId,
                    });
                    if (nErr) {
                        // socket.emit("ERROR", nErr);
                        console.error(nErr);
                    }
                    if (user.deviceInfo) {
                        pushService.send_push(null, null, user.deviceInfo.device_token, title, message, null, null, user.deviceInfo)
                    }
                    const payload = constants.activity_log_payload.message_sent_booking_chat_customer;
                    createActivityLogData.push({
                        performerId: socket.appUser.id,
                        performerName: socket.appUser.name,
                        performerRole: payload.performerRole,
                        entity: payload.entity,
                        entityId: threadId,
                        action: payload.action,
                        description: payload.description_en
                            .replace('[ID]', singlethread.bookingId)
                            .replace('[customerName]', user.name),
                        descriptionUr: payload.description_ur
                            .replace('[ID]', singlethread.bookingId)
                            .replace('[customerName]', user.name),
                        descriptionAr: payload.description_ar
                            .replace('[ID]', singlethread.bookingId)
                            .replace('[customerName]', user.name),
                        before: null,
                        after: null
                    });
                    const [activityLog, activityLogError] = await activityLogServices.bulkCreateActivityLogs(createActivityLogData)
                    if (activityLogError) {
                        console.log('activityLogError', activityLogError);
                        console.error(activityLogError);
                    }

                } else if (data.senderType === 'user' && singlethread.type === "booking") {
                    const userId = singlethread.participants.find(p => p.userType === 'mandoob')?.userId
                    const [user, uErr] = await mandoobServices.getUserWithId(userId);
                    const mandoobLanguage = await getUserLanguage(user, userId, 'mandoob');
                    let title = notifications.mandoob_notifications.new_customer_message.title[mandoobLanguage]
                    let message = notifications.mandoob_notifications.new_customer_message.content[mandoobLanguage].replace('[ID]', singlethread.bookingId)
                    const titleEnNC = notifications.mandoob_notifications.new_customer_message.title['en']
                    const titleArNC = notifications.mandoob_notifications.new_customer_message.title['ar']
                    const titleUrNC = notifications.mandoob_notifications.new_customer_message.title['ur']
                    const messageEnNC = notifications.mandoob_notifications.new_customer_message.content['en'].replace('[ID]', singlethread.bookingId);
                    const messageArNC = notifications.mandoob_notifications.new_customer_message.content['ar'].replace('[ID]', singlethread.bookingId);
                    const messageUrNC = notifications.mandoob_notifications.new_customer_message.content['ur'].replace('[ID]', singlethread.bookingId);
                    // send notification to customer
                    let [notification, nErr] = await commonService.createNotification({
                        userId: userId,
                        role: 'mandoob',
                        title: title,
                        message: message,
                        titleEn: titleEnNC,
                        titleAr: titleArNC,
                        titleUr: titleUrNC,
                        messageEn: messageEnNC,
                        messageAr: messageArNC,
                        messageUr: messageUrNC,
                        type: 'chat',
                    });
                    if (nErr) {
                        // socket.emit("ERROR", nErr);
                        console.error(nErr);
                    }
                    if (user.deviceInfo) {
                        pushService.send_push(null, null, user.deviceInfo.device_token, title, message, null, null, user.deviceInfo)
                    }
                    createActivityLogData.push({
                        performerId: user.id,
                        ...constants.activity_log_payload.message_sent_booking_chat_customer,
                        performerName: user.name,
                        entityId: threadId,
                    })
                    const [activityLog, activityLogError] = await activityLogServices.bulkCreateActivityLogs(createActivityLogData)
                    if (activityLogError) {
                        console.log('activityLogError', activityLogError);
                        console.error(activityLogError);
                    }

                }

                let serviceOffer = null, sErr = null
                //for Sending service get the service
                if (data?.messageType === "service") {
                    [serviceOffer, sErr] = await serviceServices.getServiceWithIdforMessages(data.serviceId);
                    if (sErr) {
                        socket.emit("ERROR", sErr);
                        console.error(sErr);
                        return;
                    }
                    if (!serviceOffer || serviceOffer.length === 0) {
                        socket.emit("ERROR", "Service not found");
                        console.error("Service not found");
                        return;
                    }
                    data.serviceId = serviceId
                }

                // insert message in db
                let [message, error] = await chatService.insertMessage(data);
                if (error) {
                    socket.emit("ERROR", error);
                    console.error(error);
                    if (typeof callback === 'function') {
                        callback({ status: false, error: "Failed to save message" });
                    }
                    return;
                }

                if (data.messageMedia && message) {
                    let mediaArray = [];
                    data.messageMedia.map(media => {
                        mediaArray.push({ threadId, messageId: message.id, url: media.url, type: media.type, fileName: media.fileName })
                    })
                    let medias = await chatService.bulkMediaInsert(mediaArray);
                    data.messageMedia = medias
                }

                if (message) {
                    data.id = message.id
                    data.status = 'sent'
                    // Create a new Date object
                    const currentDate = new Date();
                    // Get the current date and time in the desired format
                    const currentDateTime = currentDate.toISOString();
                    data.createdAt = message.created_at || currentDateTime
                    data.created_at = message.created_at || currentDateTime


                    if (singlethread.type === "support") {

                        console.log('Support thread - using room emission');
                        io.in(data.threadId).emit("new_message", data);
                        // const assignedAdmin = singlethread.participants.find(p => p.userType === 'admin');
                        // const userParticipant = singlethread.participants.find(p => p.userType === 'user' || p.userType === 'mandoob');

                        // if (assignedAdmin && userParticipant) {
                        //     // Find user socket
                        //     const userSocket = Array.from(io.sockets.sockets.values())
                        //         .find(s => (s.appUser?.id || s.appUser?.dataValues?.id) === userParticipant.userId && (s.userType === 'user' || s.userType === 'mandoob'));

                        //     // Find admin socket - fix ID access for Sequelize models
                        //     const adminSocket = Array.from(io.sockets.sockets.values())
                        //         .find(s => (s.appUser?.id || s.appUser?.dataValues?.id) === assignedAdmin.userId && s.userType === 'admin');

                        //     console.log('UserSocket found:', !!userSocket, userSocket?.id);
                        //     console.log('AdminSocket found:', !!adminSocket, adminSocket?.id);
                        //     console.log('Current sender socket:', socket.id);

                        //     if (socket.userType === 'admin' && userSocket) {
                        //         console.log('Emitting to user socket');
                        //         userSocket.emit("new_message", data);
                        //     }

                        //     if ((socket.userType === 'user' || socket.userType === 'mandoob') && adminSocket) {
                        //         console.log('Emitting to admin socket');
                        //         adminSocket.emit("new_message", data);
                        //     }
                        // }
                    } else {

                        //case where sending service of service to user from mandoob
                        if (messageType === 'service' && data.senderType === 'mandoob') {
                            data = {
                                ...data,
                                ...serviceOffer?.dataValues,
                                messageType: "service"
                            };
                            io.in(data.threadId).emit("new_message", data);
                        }
                        else {
                            //normal chat
                            // here is the chat booking room
                            io.in(data.threadId).emit("new_message", data);
                        }
                    }

                    if (typeof callback === 'function') {
                        callback({
                            status: true, messageId: data
                        });
                    }
                }

                // update message status in db
                let [thread, tError] = await chatService.getThread(threadId);
                if (tError) {
                    socket.emit("ERROR", tError);
                    console.error(tError);
                }

                if (thread && thread.participants.length > 0) {
                    let userstatuses = []
                    for (const participant of thread.participants) {
                        userstatuses.push({
                            threadId: threadId,
                            userId: participant.userId,
                            userType: participant.userType,
                            messageId: message.id,
                            status: senderId == participant.userId ? "2" : "0",
                            isRead: senderId == participant.userId ? 1 : 0,
                            readAt: senderId == participant.userId ? new Date() : null
                        })
                    }

                    let [messagesStatus, msError] = await chatService.bulkmessageStatusInsert(userstatuses);
                    // console.log('messagesStatus, msError:', messagesStatus, msError);

                    if (msError) {
                        socket.emit("ERROR", msError);
                        console.error(msError);
                    }
                }
                // ****************************************************
                // If user/mandoob sends a message and no admin is in thread, update pending requests
                // ****************************************************
                if (socket.userRole !== 'admin' || socket.userRole !== 'super_admin' || socket.userRole !== 'moderator') {
                    // Check if this thread has any admin
                    let [thread, tErr] = await chatService.getThread(threadId);
                    if (!tErr && thread) {
                        const hasAdmin = thread.participants?.some(p => p.userType === 'admin' || p.userType === 'super_admin' || p.userType === 'moderator');
                        if (!hasAdmin) {
                            const hasUser = thread.participants?.some(p => p.userType === 'user');
                            const hasMandoob = thread.participants?.some(p => p.userType === 'mandoob');

                            // Only broadcast if it's NOT a user-mandoob conversation
                            // (i.e., if there's no user OR no mandoob, then it's a support request)
                            if (!(hasUser && hasMandoob)) {
                                broadcastPendingRequests();
                            }
                        }
                    }
                }

            } catch (error) {
                console.error('Error in Chat socket message Send:', error);
                socket.emit("ERROR", "Socket error occurred");
                if (typeof callback === 'function') {
                    callback({ status: false, error: "Socket error occurred" });
                }
            }
        })

        socket.on('read_message', async (data, callback) => {
            try {
                let { threadId, userId } = data
                console.log('read_message is called');
                // update message status in db
                let [messagesRead, error] = await chatService.updateMessageReadStatus(threadId, userId);
                if (error)
                    console.error(error);
                // emit read_receipt to the specific thread/room : front-end user will check if(read_user_id !== current_user) than updates status on local state, 
                // because event is triggered in room and both user will get this message
                data.status = '2'
                // send to the room
                io.in(threadId).emit("read_receipt", data);
                // send other except current user
                // io.to(threadId).emit("read_receipt", data);
                // Only invoke callback if it's provided
                if (typeof callback === 'function') {
                    callback(data);
                }

                // Notify mandoob if a customer/user read the messages in this thread
                try {
                    let [threadForNotify, threadErr] = await chatService.getThread(threadId);
                    if (!threadErr && threadForNotify && threadForNotify.participants && threadForNotify.participants.length > 0) {
                        const readerParticipant = threadForNotify.participants.find(p => p.userId === userId);
                        // proceed only when the reader is a customer/user
                        if (readerParticipant && readerParticipant.userType === 'user') {
                            const mandoobParticipant = threadForNotify.participants.find(p => p.userType === 'mandoob');
                            if (mandoobParticipant) {
                                const mandoobId = mandoobParticipant.userId;
                                let [mandoobUser, muErr] = await mandoobServices.getUserWithId(mandoobId);
                                if (!muErr && mandoobUser) {
                                    const mandoobLanguage = await getUserLanguage(mandoobUser, mandoobId, 'mandoob');
                                    const title = (notifications.mandoob_notifications.customer_viewed_response.title[mandoobLanguage] || notifications.mandoob_notifications.customer_viewed_response.title['en']);
                                    const message = (notifications.mandoob_notifications.customer_viewed_response.content[mandoobLanguage] || notifications.mandoob_notifications.customer_viewed_response.content['en']);

                                    const titleEn = notifications.mandoob_notifications.customer_viewed_response.title['en'];
                                    const titleAr = notifications.mandoob_notifications.customer_viewed_response.title['ar'];
                                    const titleUr = notifications.mandoob_notifications.customer_viewed_response.title['ur'];
                                    const messageEn = notifications.mandoob_notifications.customer_viewed_response.content['en'];
                                    const messageAr = notifications.mandoob_notifications.customer_viewed_response.content['ar'];
                                    const messageUr = notifications.mandoob_notifications.customer_viewed_response.content['ur'];

                                    const [notification, nErr] = await commonService.createNotification({
                                        userId: mandoobId,
                                        role: 'mandoob',
                                        title,
                                        message,
                                        titleEn,
                                        titleAr,
                                        titleUr,
                                        messageEn,
                                        messageAr,
                                        messageUr,
                                        type: 'chat',
                                        referenceId: threadId,
                                        metaData: { bookingId: threadForNotify.bookingId }
                                    });
                                    if (nErr) console.error('Error creating customer_viewed_response notification:', nErr);

                                    if (mandoobUser.deviceInfo) {
                                        pushService.send_push(null, null, mandoobUser.deviceInfo.device_token, title, message, null, null, mandoobUser.deviceInfo);
                                    }
                                }
                            }
                        }
                    }
                } catch (notifyErr) {
                    console.error('Error sending customer_viewed_response notification:', notifyErr);
                }
            } catch (error) {
                console.error('Error in Chat socket Read:', error);
                socket.emit("ERROR", "Socket error occurred");

                if (typeof callback === 'function') {
                    callback({ status: false, error: "Socket error occurred" });
                }
            }
        })


        // ****************************************************

        // On Typing... 
        socket.on('typing', function (data) {
            try {
                io.in(data.threadId).emit("typing", data);
            } catch (error) {
                console.error('Error in Chat socket typing:', error);
                socket.emit("ERROR", "Socket error occurred");
            }
        });

        // // end typing
        // socket.on('end_typing', function (data) {
        //     io.in(data.room).emit("end_typing", data);
        // });


        // socket disconnect event handler
        socket.on('disconnect', async () => {
            try {
                console.log('disconnect event fired');

                // ****************************************************
                // Handle admin disconnection for pending requests broadcast
                // ****************************************************
                if (socket.userRole == 'admin') {
                    // Leave admin room
                    socket.leave('admin_room');
                }

                // ******************************************
                // send event to all other threads about socket disconnection
                // get rooms from threads
                let [threads, error] = await chatService.getAllThreadWithParticipant({}, { userType: socket.userType, userId: socket.appUser?.id });
                if (error) console.error(error);
                if (threads) {
                    for (const thread of threads) {
                        // send user status in-active to other users
                        io.in(thread.id).emit('user_disconnected', socket.appUser);
                    }
                }
                // set user status to offline
                await chatService.setOnlineStatus({ status: '0', userId: socket.appUser?.id, userType: socket.userType })
                // ******************************************

            } catch (error) {
                console.error('Error in Chat socket disconnect:', error);
                socket.emit("ERROR", "Socket error occurred");
            }
        })

    }
    catch (error) {
        console.error('Error in Chat socket:', error);
        socket.emit("ERROR", "Socket error occurred");
    }

})
