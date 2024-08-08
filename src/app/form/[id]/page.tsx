"use client"

import { useState, useEffect, useRef } from "react"
import {
  QRCodeGenerator,
  ProofOfPassportWeb2Verifier,
} from "@proofofpassport/sdk"
import { io, Socket } from "socket.io-client"

// Define the enum for different steps
const ProofSteps = {
  WAITING_FOR_MOBILE: "WAITING_FOR_MOBILE",
  MOBILE_CONNECTED: "MOBILE_CONNECTED",
  PROOF_GENERATION_STARTED: "PROOF_GENERATION_STARTED",
  PROOF_GENERATED: "PROOF_GENERATED",
  PROOF_VERIFIED: "PROOF_VERIFIED",
}

type ProofVerificationResult = { valid: boolean; error?: string }

export default function Form({ params }: { params: { id: number } }) {
  const qrCodeRef = useRef<HTMLDivElement>(null)
  const [proofStep, setProofStep] = useState(ProofSteps.WAITING_FOR_MOBILE)
  const [proofVerified, setProofVerified] =
    useState<ProofVerificationResult | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)

  const sessionId = "21"
  const scope = "17"

  useEffect(() => {
    // this will be custom data for each form
    const form = getFormData(params.id)

    // put custom form data into the QR code
    QRCodeGenerator.generateQRCode({
      id: `zk-form-${params.id}`,
      name: `zk-form-${params.id}`,
      userId: "1",
      disclosureOptions: {
        older_than: "18",
      },
      scope: scope,
      circuit: "disclose",
    }).then((element) => {
      if (qrCodeRef.current) {
        qrCodeRef.current.innerHTML = ""
        qrCodeRef.current.appendChild(element as any)
      }
    })

    const newSocket = io("https://proofofpassport-merkle-tree.xyz", {
      path: "/websocket",
      query: { sessionId, clientType: "web" },
    })

    newSocket.on("connect", () => {
      console.log("Web browser connected to WebSocket server")
    })

    newSocket.on("mobile_status", async (data) => {
      console.log("Received mobile status:", data.status)
      switch (data.status) {
        case "mobile_connected":
          setProofStep(ProofSteps.MOBILE_CONNECTED)
          break
        case "proof_generation_started":
          setProofStep(ProofSteps.PROOF_GENERATION_STARTED)
          break
        case "proof_generated":
          setProofStep(ProofSteps.PROOF_GENERATED)
          break
        // default:
        //   setProofStep(ProofSteps.WAITING_FOR_MOBILE);
      }

      if (data.proof) {
        const requirements = []

        requirements.push(["older_than", "18"])

        const popWeb2Verifier = new ProofOfPassportWeb2Verifier({
          scope: scope,
          requirements,
        })
        try {
          const local_proofVerified = await popWeb2Verifier.verify(data.proof)
          console.log("proofVerified", local_proofVerified.toJson())
          setProofVerified({ valid: true })
          setProofStep(ProofSteps.PROOF_VERIFIED)

          // Send proof_verified status back to the server
          newSocket.emit("proof_verified", {
            sessionId,
            proofVerified: local_proofVerified.toJson(),
          })
        } catch (error) {
          console.error("Error verifying proof:", error)
          setProofVerified({ valid: false, error: (error as Error).message })
          newSocket.emit("proof_verified", {
            sessionId,
            proofVerified: { valid: false, error: (error as Error).message },
          })
        }
      }
      console.log(data)
    })

    newSocket.on("disconnect", () => {
      console.log("Web browser disconnected from WebSocket server")
      setProofStep(ProofSteps.WAITING_FOR_MOBILE)
    })

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-between p-24">
      <h1 className="text-xl mb-5">
        You've opened questionnaire #{params.id}!
      </h1>
      <div className="text-left">
        Scan this QR to verify your identity. We need to validate the following
        requirements:
        <ul className="list-disc text-left">
          <li>{`Age > 18`}</li>
        </ul>
        In addition, we want to collect the following characteristics, in order
        to analyse the data correctly:
        <ul className="list-disc text-left w-20">
          <li>Age</li>
          <li>Nationality</li>
          <li>Gender</li>
        </ul>
        <span>
          This allows us to carry out analysis on the responses, whilst
          maintaining your identity completely private.
        </span>
        <div className="" ref={qrCodeRef} />
        <button></button>
      </div>
    </div>
  )
}

enum IdentityField {
  GENDER,
  NATIONALITY,
  AGE,
}

type IdentityConstraints = {
  field: IdentityField
}

type FormData = {
  id: number
  identityConstraints: IdentityField[]
}

const getFormData = (id: number) => {
  return {
    id,
    identityCharacteristics: [IdentityField.GENDER, IdentityField.NATIONALITY],
  }
}
